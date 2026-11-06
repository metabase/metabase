import type { ColumnSettings, ImageSize } from "metabase-types/api";

import { getUrlProtocol } from "./url";

export const DEFAULT_IMAGE_SIZE: ImageSize = "small";

const IMAGE_HEIGHTS_PX = {
  small: 30,
  medium: 75,
  large: 150,
} satisfies Record<ImageSize, number>;

/**
 * Returns the height in pixels of an image shown with `view_as: "image"`.
 * Unknown or missing sizes fall back to the default size.
 */
export function getImageHeightPx(imageSize: ImageSize | undefined): number {
  // Saved settings can hold any string, including Object.prototype keys
  return imageSize != null && Object.hasOwn(IMAGE_HEIGHTS_PX, imageSize)
    ? IMAGE_HEIGHTS_PX[imageSize]
    : IMAGE_HEIGHTS_PX[DEFAULT_IMAGE_SIZE];
}

export function formatImage(
  value: string,
  { jsx, rich, view_as = "auto", image_size }: ColumnSettings = {},
) {
  const url = String(value);
  const protocol = getUrlProtocol(url);
  const acceptedProtocol = protocol === "http:" || protocol === "https:";
  if (jsx && rich && view_as === "image" && acceptedProtocol) {
    return <img src={url} style={{ height: getImageHeightPx(image_size) }} />;
  } else {
    return url;
  }
}
