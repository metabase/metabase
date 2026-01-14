import { trackSchemaEvent } from "metabase/lib/analytics";
import type { SetupVersion } from "metabase-types/analytics/setup";
import type { UsageReason } from "metabase-types/api";

import type { SetupStep } from "./types";

/**
 * The internal "versioning" tracker that needs to be bumped for every significant
 * change to the setup flow. If you update the version here, make sure to add an
 * entry to the corresponding Notion doc:
 * {@link https://www.notion.so/metabase/Set-up-step-seen-19f39925938d401da2111f8a3d0dc36c}.
 */
const ONBOARDING_VERSION: SetupVersion = "1.4.0";

export const trackStepSeen = ({
  stepName,
  stepNumber,
}: {
  stepName: SetupStep;
  stepNumber: number;
}) => {
  trackSchemaEvent("setup", {
    event: "step_seen",
    version: ONBOARDING_VERSION,
    step: stepName,
    step_number: stepNumber,
  });
};

export const trackUsageReasonSelected = (usageReason: UsageReason) => {
  trackSchemaEvent("setup", {
    event: "usage_reason_selected",
    version: ONBOARDING_VERSION,
    usage_reason: usageReason,
  });
};

export const trackLicenseTokenStepSubmitted = (validTokenPresent: boolean) => {
  trackSchemaEvent("setup", {
    event: "license_token_step_submitted",
    valid_token_present: validTokenPresent,
    version: ONBOARDING_VERSION,
  });
};

export const trackDatabaseSelected = (engine: string) => {
  trackSchemaEvent("setup", {
    event: "database_selected",
    version: ONBOARDING_VERSION,
    database: engine,
  });
};

export const trackAddDataLaterClicked = (engine?: string) => {
  trackSchemaEvent("setup", {
    event: "add_data_later_clicked",
    version: ONBOARDING_VERSION,
    source: engine ? "post_selection" : "pre_selection",
  });
};

export const trackTrackingChanged = (isTrackingAllowed: boolean) => {
  trackSchemaEvent("settings", {
    event: isTrackingAllowed
      ? "tracking_permission_enabled"
      : "tracking_permission_disabled",
    source: "setup",
  });
};
