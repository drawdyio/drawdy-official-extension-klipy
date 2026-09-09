export type MediaTypeId = "gifs" | "stickers" | "clips";

export type MediaTypeConfig = {
  id: MediaTypeId;
  label: string;
  plural: string;
  screenWidth: number;
};

export type GifFile = {
  url: string;
  width: number;
  height: number;
};

export type GifItem = {
  id: string;
  title: string;
  preview: GifFile;
  full: GifFile;
};

export type SearchErrorKind = "network" | "other";

export type WebviewToDriver =
  | { type: "ready" }
  | { type: "search"; requestId: number; query: string; page: number }
  | { type: "drop-gif"; gif: GifItem; x: number; y: number }
  | { type: "insert-gif"; gif: GifItem };

export type DriverToWebview =
  | { type: "init" }
  | {
      type: "results";
      requestId: number;
      query: string;
      page: number;
      items: GifItem[];
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
