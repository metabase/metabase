import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackOnboardingChecklistOpened = () => {
  trackSimpleEvent({
    event: "onboarding_checklist_opened",
  });
};
