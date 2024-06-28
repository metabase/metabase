import type { Location } from "history";

import type { SelectedTabId } from "metabase-types/store";

export function parseSlug({ location }: { location: Location }) {
  const slug = location.query["tab"];
  if (typeof slug === "string" && slug.length > 0) {
    return slug;
  }
  return undefined;
}

export function getSlug({
  tabId,
  name,
}: {
  tabId: SelectedTabId;
  name: string | undefined;
}) {
  if (tabId === null || tabId < 0 || !name) {
    return "";
  }
  return [tabId, ...name.toLowerCase().split(" ")].join("-");
}
