import type { Card, CustomVizDisplayType, Dashboard } from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards";

export function getResourceCustomVisualizations(
  resource: Card | Dashboard | null,
): CustomVizDisplayType[] {
  if (!resource) {
    return [];
  }

  const displays =
    "dashcards" in resource
      ? resource.dashcards.map((dashcard) => dashcard.card.display)
      : [resource.display];

  return Array.from(new Set(displays.filter(isCustomVizDisplay)));
}
