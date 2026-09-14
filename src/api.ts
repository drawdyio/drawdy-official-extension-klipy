import { mediaTypeConfig } from "./consts";
import { BUILD_API_BASE } from "./env";
import { MediaItem, MediaTypeId, SearchErrorKind } from "./types";

export class KlipyError extends Error {
  public readonly kind: SearchErrorKind;

  constructor(kind: SearchErrorKind, message: string) {
    super(message);
    this.name = "KlipyError";
    this.kind = kind;
  }
}

export type FetchMediaArgs = {
  media: MediaTypeId;
  customerId: string;
  query: string;
  page: number;
  perPage: number;
};

export type MediaPage = {
  items: MediaItem[];
  hasNext: boolean;
};

type ProxyResponse = {
  items?: MediaItem[];
  hasNext?: boolean;
  error?: string;
};

/**
 * Searches (or, with an empty query, lists trending) one Klipy media type
 * through the Drawdy backend proxy. All three routes share one response shape.
 */
export async function fetchMedia(args: FetchMediaArgs): Promise<MediaPage> {
  const params = new URLSearchParams({
    page: String(args.page),
    per_page: String(args.perPage),
    customer_id: args.customerId,
  });
  const query = args.query.trim();
  if (query) params.set("q", query);
  const url = `${BUILD_API_BASE}/api/klipy/${args.media}?${params}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new KlipyError(
      "network",
      "Could not reach KLIPY. Check your connection and try again.",
    );
  }

  let body: ProxyResponse | null = null;
  try {
    body = (await res.json()) as ProxyResponse;
  } catch {
    body = null;
  }

  if (!res.ok || !body || !Array.isArray(body.items)) {
    const label = mediaTypeConfig(args.media).singular;
    throw new KlipyError(
      "other",
      body?.error ?? `${label} search failed (HTTP ${res.status}).`,
    );
  }

  return { items: body.items, hasNext: body.hasNext === true };
}
