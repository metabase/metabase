const hashCSSSelector = ({ prefix, selector }) => {
  let hash = 0;

  for (let i = 0; i < selector.length; i += 1) {
    const chr = selector.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }

  return `${prefix}_${(hash + 2147483648).toString(16)}`;
};

/**
 * Taken from https://github.com/rtivital/hash-css-selector
 * But generates hashes based on the full css module file path,
 */
export const generateScopedCssClassName = (selector, fileName) => {
  const prefix = "mb";
  const getFileName = (filePath) => {
    return filePath
      .replace(/\\/g, "/")
      .replace(".module", "")
      .replace(".css", "")
      .replace(".scss", "");
  };

  return hashCSSSelector({
    prefix,
    selector: `${getFileName(fileName)}-${selector}`,
  });
};
