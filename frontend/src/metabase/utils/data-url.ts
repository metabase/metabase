interface ParsedDataUri {
  mimeType: string | undefined;
  charset: string | undefined;
  data: string;
}

export function parseDataUri(
  url: string | null | undefined,
): ParsedDataUri | null {
  // data:[<mediatype>][;base64],<data> (RFC 2397)
  // The header groups must not match "," so that the first comma is what separates
  // the header from the data, and the data itself may contain any further commas.
  const match =
    url && url.match(/^data:(?:([^;,]+)(?:;([^;,]+))?)?(;base64)?,(.*)$/);
  if (match) {
    let [, mimeType, charset, base64, data]: (string | undefined)[] = match;
    if (charset === "base64" && !base64) {
      base64 = charset;
      charset = undefined;
    }
    return {
      mimeType,
      charset,
      data: base64 ? atob(data) : data,
    };
  }
  return null;
}
