export const localizeInput = (input: string, locale = "es") => {
  // simplify locale for now
  locale = locale.split("-")[0];
  const pattern = new RegExp(`\\(${locale} (.*?)\\)`);
  const match = input.match(pattern);
  if (match) {
    return match[1];
  } else {
    // If no translation is specified, use the untranslated string
    return input.replace(/([a-z][a-z] .\+)/g, " ");
  }
};
