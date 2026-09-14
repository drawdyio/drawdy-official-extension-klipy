export type MediaTypeId = "gifs" | "stickers" | "clips";

export type MediaTypeConfig = {
  id: MediaTypeId;
  label: string;
  singular: string;
  plural: string;
  screenWidth: number;
};

export type WebviewMediaType = Pick<MediaTypeConfig, "id" | "label" | "plural">;

export type MediaFile = {
  url: string;
  width: number;
  height: number;
};

export type MediaItem = {
  id: string;
  title: string;
  preview: MediaFile;
  full: MediaFile;
};

export type SearchErrorKind = "network" | "other";

export type WebviewToDriver =
  | { type: "ready" }
  | {
      type: "search";
      requestId: number;
      media: MediaTypeId;
      query: string;
      page: number;
    }
  | {
      type: "drop-media";
      media: MediaTypeId;
      item: MediaItem;
      x: number;
      y: number;
    }
  | { type: "insert-media"; media: MediaTypeId; item: MediaItem };

export type DriverToWebview =
  | { type: "init"; mediaTypes: WebviewMediaType[]; defaultMedia: MediaTypeId }
  | {
      type: "results";
      requestId: number;
      media: MediaTypeId;
      query: string;
      page: number;
      items: MediaItem[];
      hasNext: boolean;
    }
  | {
      type: "error";
      requestId: number;
      kind: SearchErrorKind;
      message: string;
    }
  | { type: "styling"; css: string }
  | { type: "debug"; text: string };
