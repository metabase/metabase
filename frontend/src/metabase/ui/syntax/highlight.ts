import { HighlightStyle } from "@codemirror/language";
import type { Tag } from "@lezer/highlight";
import { tags } from "@lezer/highlight";

import S from "./highlight.module.css";

export const metabaseSyntaxHighlighting = HighlightStyle.define([
  {
    tag: tags.function(tags.variableName),
    class: S,
  },
  ...Object.values(tags)
    .filter((tag): tag is Tag => typeof tag !== "function")
    .map((tag: Tag) => ({
      tag,
      class: classNameForTag(tag),
    })),
]);

/**
 * Returns the correct css class name for a @lezer/highlight tag.
 */
export function classNameForTag(tag: Tag | Tag[]): string {
  if (Array.isArray(tag)) {
    return tag.map(classNameForTag).join(" ");
  }

  // lezer generates tags like function(variableName) for combined tags
  // we split them up here so we generate classNames like .function.variableName
  const names = tag.toString().split(/[\(\)]/);

  return names
    .map(name => S[name] ?? "")
    .filter(x => x !== "")
    .join(" ");
}
