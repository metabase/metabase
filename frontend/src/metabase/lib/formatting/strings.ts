import inflection from "inflection";

import { formatEmail } from "./email";
import { formatImage } from "./image";

export function singularize(...args) {
  return inflection.singularize(...args);
}

export function pluralize(...args) {
  return inflection.pluralize(...args);
}

export function capitalize(str, { lowercase = true } = {}) {
  const firstChar = str.charAt(0).toUpperCase();
  let rest = str.slice(1);
  if (lowercase) {
    rest = rest.toLowerCase();
  }
  return firstChar + rest;
}

export function inflect(...args) {
  return inflection.inflect(...args);
}

export function titleize(...args) {
  return inflection.titleize(...args);
}

export function humanize(...args) {
  return inflection.humanize(...args);
}

// fallback for formatting a string without a column semantic_type
function formatStringFallback(value, options = {}) {
  if (options.view_as !== null) {
    value = formatUrl(value, options);
    if (typeof value === "string") {
      value = formatEmail(value, options);
    }
    if (typeof value === "string") {
      value = formatImage(value, options);
    }
  }
  return value;
}

export function conjunct(list, conjunction) {
  return (
    list.slice(0, -1).join(`, `) +
    (list.length > 2 ? `,` : ``) +
    (list.length > 1 ? ` ${conjunction} ` : ``) +
    (list[list.length - 1] || ``)
  );
}

// Removes trailing "id" from field names
export function stripId(name) {
  return name && name.replace(/ id$/i, "").trim();
}
