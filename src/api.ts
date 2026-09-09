import { BUILD_API_BASE } from "./env";
import { GifItem, SearchErrorKind } from "./types";

export class KlipyError extends Error {
  public readonly kind: SearchErrorKind;

  constructor(kind: SearchErrorKind, message: string) {
    super(message);
    this.name = "KlipyError";
    this.kind = kind;
  }
}

export type FetchGifsArgs = {
  customerId: string;
  query: string;
  page: number;
  perPage: number;
};

export type GifPage = {
  items: GifItem[];
  hasNext: boolean;
};

type ProxyResponse = {
  items?: GifItem[];
  hasNext?: boolean;
  error?: string;
};

export async function fetchGifs(args: FetchGifsArgs): Promise<GifPage> {
  const params = new URLSearchParams({
    page: String(args.page),
    per_page: String(args.perPage),
    customer_id: args.customerId,
  });
  const query = args.query.trim();
  if (query) params.set("q", query);
  const url = `${BUILD_API_BASE}/api/klipy/gifs?${params}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new KlipyError(
      "network",
      "Could not reach the GIF search service. Check your connection and try again.",
    );
  }

  let body: ProxyResponse | null = null;
  try {
    body = (await res.json()) as ProxyResponse;
  } catch {
    body = null;
  }

  if (!res.ok || !body || !Array.isArray(body.items)) {
    throw new KlipyError(
      "other",
      body?.error ?? `GIF search failed (HTTP ${res.status}).`,
    );
  }

  return { items: body.items, hasNext: body.hasNext === true };
}
