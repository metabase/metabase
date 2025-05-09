import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackOnboardingChecklistOpened = () => {
  trackSimpleEvent({
    event: "onboarding_checklist_opened",
  });
};

export const trackNewCollectionFromNavInitiated = () =>
  trackSimpleEvent({
    event: "plus_button_clicked",
    triggered_from: "collection-nav",
  });
