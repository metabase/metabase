import { getUrlProtocol } from "./url";
import type { OptionsType } from "./types";

export function formatImage(
  value: string,
  { jsx, rich, view_as = "auto" }: OptionsType = {},
) {
  const url = String(value);
  const protocol = getUrlProtocol(url);
  const acceptedProtocol = protocol === "http:" || protocol === "https:";
  if (jsx && rich && view_as === "image" && acceptedProtocol) {
    return <img src={url} style={{ height: 30 }} />;
  } else {
    return url;
  }
}
