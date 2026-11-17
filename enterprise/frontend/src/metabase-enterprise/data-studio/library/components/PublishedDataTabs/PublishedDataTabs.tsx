import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import * as Urls from "metabase/urls";

/** Switches the Published data page between published and suggested tables */
export function PublishedDataTabs() {
  const tabs: PillTab[] = [
    {
      label: t`Published`,
      to: Urls.dataStudioPublishedData(),
      icon: "published",
    },
    {
      label: t`Suggested`,
      to: Urls.dataStudioSuggestedTables(),
      icon: "lightbulb",
    },
  ];

  return <PillTabNavigation tabs={tabs} />;
}
