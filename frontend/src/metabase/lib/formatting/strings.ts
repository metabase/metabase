import inflection from "inflection";

import { getDataFromClicked } from "metabase-lib/lib/parameters/utils/click-behavior";
import { formatUrl } from "./url";
import { renderLinkTextForClick } from "./link";
import { formatValue, getRemappedValue } from "./value";
import { formatEmail } from "./email";
import { formatImage } from "./image";

import type { OptionsType } from "./types";

export function singularize(str: string, singular?: string) {
  return inflection.singularize(str, singular);
}

export function pluralize(str: string, plural?: string) {
  return inflection.pluralize(str, plural);
}

export function capitalize(str: string, { lowercase = true } = {}) {
  const firstChar = str.charAt(0).toUpperCase();
  let rest = str.slice(1);
  if (lowercase) {
    rest = rest.toLowerCase();
  }
  return firstChar + rest;
}

export function inflect(
  str: string,
  count: number,
  singular?: string,
  plural?: string,
) {
  return inflection.inflect(str, count, singular, plural);
}

export function titleize(str: string) {
  return inflection.titleize(str);
}

export function humanize(str: string, lowFirstLetter?: boolean) {
  return inflection.humanize(str, lowFirstLetter);
}

// fallback for formatting a string without a column semantic_type
export function formatStringFallback(value: any, options: OptionsType = {}) {
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

export function conjunct(list: string[], conjunction: string) {
  return (
    list.slice(0, -1).join(`, `) +
    (list.length > 2 ? `,` : ``) +
    (list.length > 1 ? ` ${conjunction} ` : ``) +
    (list[list.length - 1] || ``)
  );
}

// Removes trailing "id" from field names
export function stripId(name: string) {
  return name?.replace(/ id$/i, "").trim();
}

function getLinkText(value: string, options: OptionsType) {
  const { view_as, link_text, clicked } = options;

  const isExplicitLink = view_as === "link";
  const hasCustomizedText = link_text && clicked;

  if (isExplicitLink && hasCustomizedText) {
    return renderLinkTextForClick(
      link_text,
      getDataFromClicked(clicked) as any,
    );
  }

  return (
    getRemappedValue(value, options) ||
    formatValue(value, { ...options, view_as: null })
  );
}
