import { dayjs } from "metabase/dayjs";

/** A list inside a sentence, in the user's language: "Orders and Products", "Orders, Products, and People". */
export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(dayjs.locale(), { type: "conjunction" }).format(
    items,
  );
}
