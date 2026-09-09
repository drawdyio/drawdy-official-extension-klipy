import { MediaTypeConfig, MediaTypeId } from "./types";

export const MEDIA_TYPES: MediaTypeConfig[] = [
  {
    id: "gifs",
    label: "GIFs",
    plural: "GIFs",
    screenWidth: 220,
  },
  {
    id: "stickers",
    label: "Stickers",
    plural: "stickers",
    screenWidth: 180,
  },
  {
    id: "clips",
    label: "Clips",
    plural: "clips",
    screenWidth: 260,
  },
];

export const DEFAULT_MEDIA_TYPE: MediaTypeId = "gifs";

export function mediaTypeConfig(id: string): MediaTypeConfig {
  return (
    MEDIA_TYPES.find((type) => type.id === id) ??
    MEDIA_TYPES.find((type) => type.id === DEFAULT_MEDIA_TYPE)!
  );
}

export const PER_PAGE = 24;

export const CUSTOMER_STORAGE_KEY = "klipy-customer";
