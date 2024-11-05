import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackAddDataViaDatabase = () => {
  trackSimpleEvent({
    event: "data_add_via_db_clicked",
  });
};

export const trackOnboardingChecklistOpened = () => {
  trackSimpleEvent({
    event: "onboarding_checklist_opened",
  });
};
