export function quoteParameters(params: Record<string, string | null>) {
  const quotedParams: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value == null) {
      quotedParams[key] = "";
    } else {
      quotedParams[key] = `"${value}"`;
    }
  });
  return quotedParams;
}

export function unquoteParameters(params: Record<string, string>) {
  const unquotedParams: Record<string, string | null> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === "") {
      unquotedParams[key] = null;
    } else if (
      value.length >= 2 &&
      value.startsWith('"') &&
      value.endsWith('"')
    ) {
      unquotedParams[key] = value.slice(1, -1);
    } else {
      unquotedParams[key] = value;
    }
  });
  return unquotedParams;
}
