import React from "react";

import { getUrlProtocol } from "./url";

export function formatImage(
  value,
  { jsx, rich, view_as = "auto", link_text } = {},
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
