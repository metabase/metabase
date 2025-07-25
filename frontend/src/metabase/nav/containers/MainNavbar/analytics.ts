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

export const trackAddDataModalOpened = (
  from: "getting-started" | "left-nav",
) => {
  trackSimpleEvent({
    event: "data_add_modal_opened",
    triggered_from: from,
  });
};
