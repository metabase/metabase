import _ from "underscore";

// Creates a regex that will find an order dependent, case insensitive substring. All whitespace will be rendered as ".*" in the regex, to create a fuzzy search.
export function createMultiwordSearchRegex(input) {
  if (input) {
    return new RegExp(_.map(input.split(/\s+/), regexpEscape).join(".*"), "i");
  }
}

// prefix special characters with "\" for creating a regex
export function regexpEscape(s) {
  const regexpSpecialChars = /[\^\$\\\.\*\+\?\(\)\[\]\{\}\|]/g;
  // "$&" in the replacement string is replaced with the matched string
  return s.replace(regexpSpecialChars, "\\$&");
}

export const countLines = str => str.split(/\n/g).length;

export function caseInsensitiveSearch(haystack, needle) {
  return (
    !needle ||
    (haystack != null &&
      haystack.toLowerCase().indexOf(needle.toLowerCase()) >= 0)
  );
}
