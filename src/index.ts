import {
  DriverCommandIssuer,
  DriverManifest,
  DriverModule,
  ModuleStyling,
} from "@drawdy/driver-protocol";
import { KLIPY_SVG } from "./icon";
import {
  DEFAULT_MEDIA_TYPE,
  mediaTypeConfig,
  PER_PAGE,
  WEBVIEW_MEDIA_TYPES,
} from "./consts";
import { fetchMedia, KlipyError } from "./api";
import {
  DriverToWebview,
  MediaItem,
  MediaTypeId,
  WebviewToDriver,
} from "./types";
import { loadCustomerId, randomUuid, StorageCtx } from "./storage";
import { WEBVIEW_HTML } from "./webview-html";

let requestId = 0;

let driver: {
  manifest: DriverManifest;
  issueCommand: DriverCommandIssuer;
  generateId: () => string;
  styling: ModuleStyling;
  actionButtonId: string;
  webviewId: string;
} | null = null;

let customerId = "";

const nextRequestId = (): string => String(requestId++);

const storageCtx = (): StorageCtx | null =>
  driver
    ? {
        driverId: driver.manifest.driverId,
        issueCommand: driver.issueCommand,
        nextRequestId,
      }
    : null;

function stylingCssVars(styling: ModuleStyling): string {
  return Object.entries(styling)
    .map(([key, value]) =>
      key === "theme"
        ? `color-scheme: ${value};`
        : `--drawdy-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`,
    )
    .join("");
}

function post(message: DriverToWebview): void {
  if (!driver) return;
  void driver.issueCommand({
    type: "command:webview:post-message",
    driverId: driver.manifest.driverId,
    requestId: nextRequestId(),
    req: { webviewDomId: driver.webviewId, message },
  });
}

export const activate: DriverModule["activate"] = async ({
  manifest,
  issueCommand,
  styling,
  generateId,
}) => {
  driver = {
    manifest,
    issueCommand,
    generateId,
    styling,
    actionButtonId: `${manifest.driverId}:action-button`,
    webviewId: `${manifest.driverId}:webview`,
  };

  const response = await issueCommand({
    type: "command:dom:create-action-button",
    driverId: manifest.driverId,
    requestId: nextRequestId(),
    req: {
      domElementId: driver.actionButtonId,
      svg: KLIPY_SVG,
    },
  });
  if (!response.res.value?.created) {
    return;
  }

  await issueCommand({
    type: "subscription:dom:theme-changed",
    driverId: manifest.driverId,
    requestId: nextRequestId(),
  });

  await issueCommand({
    type: "subscription:dom:element-clicked",
    driverId: manifest.driverId,
    requestId: nextRequestId(),
    req: { domElementId: driver.actionButtonId },
  });

  await issueCommand({
    type: "subscription:webview:message",
    driverId: manifest.driverId,
    requestId: nextRequestId(),
    req: { webviewDomId: driver.webviewId },
  });

  const ctx = storageCtx();
  if (!ctx) return;
  try {
    customerId = await loadCustomerId(ctx);
  } catch {
    customerId = randomUuid();
  }
};

export const onEvent: DriverModule["onEvent"] = async (e) => {
  if (!driver) return;
  switch (e.type) {
    case "subscription:dom:theme-changed": {
      driver.styling = e.body.styling;
      post({ type: "styling", css: stylingCssVars(driver.styling) });
      return;
    }
    case "subscription:dom:element-clicked": {
      if (e.body.domElementId !== driver.actionButtonId) return;
      await driver.issueCommand({
        type: "command:webview:create",
        driverId: driver.manifest.driverId,
        requestId: nextRequestId(),
        req: {
          webviewDomId: driver.webviewId,
          htmlContent: WEBVIEW_HTML.replace(
            "/*__DRAWDY_STYLING__*/",
            stylingCssVars(driver.styling),
          ),
          keepStateWhenClosed: true,
        },
      });
      return;
    }
    case "subscription:webview:message": {
      if (e.body.webviewDomId !== driver.webviewId) return;
      const message = e.body.message;
      if (typeof message !== "object" || message === null) return;
      await handleWebviewMessage(message as WebviewToDriver);
      return;
    }
    default: {
      return;
    }
  }
};

async function handleWebviewMessage(message: WebviewToDriver): Promise<void> {
  switch (message.type) {
    case "ready": {
      post({
        type: "init",
        mediaTypes: WEBVIEW_MEDIA_TYPES,
        defaultMedia: DEFAULT_MEDIA_TYPE,
      });
      return;
    }
    case "search": {
      await runSearch(
        message.requestId,
        message.media,
        message.query,
        message.page,
      );
      return;
    }
    case "drop-media": {
      await placeMedia(message.media, message.item, message.x, message.y);
      return;
    }
    case "insert-media": {
      await insertAtViewportCenter(message.media, message.item);
      return;
    }
  }
}

async function runSearch(
  id: number,
  requestedMedia: MediaTypeId,
  query: string,
  page: number,
): Promise<void> {
  if (!customerId) customerId = randomUuid();
  // Unknown ids fall back to the default type rather than hitting a 404.
  const media = mediaTypeConfig(requestedMedia).id;
  try {
    const result = await fetchMedia({
      media,
      customerId,
      query,
      page,
      perPage: PER_PAGE,
    });
    post({
      type: "results",
      requestId: id,
      media,
      query,
      page,
      items: result.items,
      hasNext: result.hasNext,
    });
  } catch (err) {
    post({
      type: "error",
      requestId: id,
      kind: err instanceof KlipyError ? err.kind : "other",
      message: err instanceof Error ? err.message : "Something went wrong.",
    });
  }
}

async function insertMedia(
  media: MediaTypeId,
  item: MediaItem,
  canvasX: number,
  canvasY: number,
): Promise<void> {
  if (!driver) return;
  const info = await driver.issueCommand({
    type: "command:camera:get-info",
    driverId: driver.manifest.driverId,
    requestId: nextRequestId(),
  });
  if (!driver || info.res.error !== undefined) return;
  const zoom = info.res.value.zoom;
  const width = mediaTypeConfig(media).screenWidth / zoom;
  const ratio =
    item.full.width > 0 && item.full.height > 0
      ? item.full.height / item.full.width
      : 1;
  const height = width * ratio;
  const elementId = driver.generateId();
  await driver.issueCommand({
    type: "command:scene:add-drawdy-elements",
    driverId: driver.manifest.driverId,
    requestId: nextRequestId(),
    req: {
      elements: [
        {
          type: "component",
          drawdyElementId: elementId,
          x: canvasX - width / 2,
          y: canvasY - height / 2,
          width,
          height,
          schema: {
            type: "box",
            styles: {
              width: [width, "px"],
              height: [height, "px"],
              overflow: "hidden",
            },
            children: [
              {
                type: "image",
                child: item.full.url,
                styles: {
                  width: [width, "px"],
                  height: [height, "px"],
                },
              },
            ],
          },
        },
      ],
    },
  });
}

async function placeMedia(
  media: MediaTypeId,
  item: MediaItem,
  iframeX: number,
  iframeY: number,
): Promise<void> {
  if (!driver) return;

  const rectRes = await driver.issueCommand({
    type: "command:dom:element-rect",
    driverId: driver.manifest.driverId,
    requestId: nextRequestId(),
    req: { elementId: driver.webviewId },
  });
  if (!driver || rectRes.res.error !== undefined) return;
  const rect = rectRes.res.value;

  const insidePalette =
    iframeX >= 0 &&
    iframeY >= 0 &&
    iframeX <= rect.width &&
    iframeY <= rect.height;
  if (insidePalette) return;

  const canvasRes = await driver.issueCommand({
    type: "command:camera:screen-to-canvas",
    driverId: driver.manifest.driverId,
    requestId: nextRequestId(),
    req: { x: rect.x + iframeX, y: rect.y + iframeY },
  });
  if (!driver || canvasRes.res.error !== undefined) return;
  const { x, y } = canvasRes.res.value;

  await insertMedia(media, item, x, y);
}

async function insertAtViewportCenter(
  media: MediaTypeId,
  item: MediaItem,
): Promise<void> {
  if (!driver) return;
  const res = await driver.issueCommand({
    type: "command:camera:get-viewport-rect",
    driverId: driver.manifest.driverId,
    requestId: nextRequestId(),
  });
  if (!driver || res.res.error !== undefined) return;
  const { rect } = res.res.value;
  await insertMedia(
    media,
    item,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
  );
}
