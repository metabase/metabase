// prefix special characters with "\" for creating a regex
export function regexpEscape(s) {
  const regexpSpecialChars = /[\^\$\\\.\*\+\?\(\)\[\]\{\}\|]/g;
  // "$&" in the replacement string is replaced with the matched string
  return s.replace(regexpSpecialChars, "\\$&");
}
