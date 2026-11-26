import { usePageTitle } from "metabase/hooks/use-page-title";

import { AccordionGuideLayout } from "./guide/AccordionGuideLayout";
import { CardsGuideLayout } from "./guide/CardsGuideLayout";
import { NumberedGuideLayout } from "./guide/NumberedGuideLayout";
import { SimpleGuideLayout } from "./guide/SimpleGuideLayout";
import { useGuideGroups } from "./guide/use-guide-groups";
import { useGuideLayout } from "./use-discovery-variant";

/**
 * PROTOTYPE: the `/data-apps` page in the main app. It walks through the steps to a first data app, in the layout
 * the variant picker has selected.
 */
export function DataAppsGuidePage() {
  usePageTitle("Data apps");
  const groups = useGuideGroups();
  const { layout } = useGuideLayout();

  if (layout === "accordion") {
    return <AccordionGuideLayout groups={groups} />;
  }
  if (layout === "numbered") {
    return <NumberedGuideLayout groups={groups} />;
  }
  if (layout === "simple") {
    return <SimpleGuideLayout />;
  }
  return <CardsGuideLayout groups={groups} />;
}
