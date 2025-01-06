import { parseHashOptions } from "metabase/lib/browser";
import * as Urls from "metabase/lib/urls";
import type { DashboardId } from "metabase-types/api";
import type { StoreDashcard } from "metabase-types/store";

import type { DashboardAppProps } from "./DashboardApp";

export function getDashboardId({ dashboardId, params }: DashboardAppProps) {
  if (dashboardId) {
    return dashboardId;
  }

  return Urls.extractEntityId(params.slug) as DashboardId;
}

export function getDashboardUrlHashOptions(
  locationHash: string,
  dashcards: StoreDashcard[],
) {
  const options = parseHashOptions(locationHash);

  const editingOnLoad = options.edit;
  const addCardOnLoad = options.add != null ? Number(options.add) : undefined;

  // validate the dashcard to auto-scroll to exists
  const scrollToDcId = options.scrollTo
    ? parseInt("" + options.scrollTo, 10)
    : undefined;
  const scrollToCardOnLoad = options.scrollTo
    ? dashcards.find(dc => dc.id === scrollToDcId)?.id
    : undefined;

  return { editingOnLoad, addCardOnLoad, scrollToCardOnLoad };
}
