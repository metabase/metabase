interface ParsedDataUri {
  mimeType: string | undefined;
  charset: string | undefined;
  data: string;
}

export function parseDataUri(
  url: string | null | undefined,
): ParsedDataUri | null {
  // https://regexr.com/8e8gt
  const match =
    url &&
    url.match(/^data:(?:([^;]+)(?:;([^;]+))?)?(;base64)?,((?:(?!\1|,).)*)$/);
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
