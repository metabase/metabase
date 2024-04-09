import { trackSchemaEvent } from "metabase/lib/analytics";
import type { UsageReason } from "metabase-types/api";

import type { SetupStep } from "./types";

const ONBOARDING_VERSION = "1.2.0";
const SETUP_SCHEMA_VERSION = "1-0-3";
const SETTINGS_SCHEMA_VERSION = "1-0-2";

export const trackStepSeen = ({
  stepName,
  stepNumber,
}: {
  stepName: SetupStep;
  stepNumber: number;
}) => {
  trackSchemaEvent("setup", SETUP_SCHEMA_VERSION, {
    event: "step_seen",
    version: ONBOARDING_VERSION,
    step: stepName,
    step_number: stepNumber,
  });
};

export const trackUsageReasonSelected = (usageReason: UsageReason) => {
  trackSchemaEvent("setup", SETUP_SCHEMA_VERSION, {
    event: "usage_reason_selected",
    version: ONBOARDING_VERSION,
    usage_reason: usageReason,
  });
};

export const trackLicenseTokenStepSubmitted = (validTokenPresent: boolean) => {
  trackSchemaEvent("setup", SETUP_SCHEMA_VERSION, {
    event: "license_token_step_submitted",
    valid_token_present: validTokenPresent,
    version: ONBOARDING_VERSION,
  });
};

export const trackDatabaseSelected = (engine: string) => {
  trackSchemaEvent("setup", SETUP_SCHEMA_VERSION, {
    event: "database_selected",
    version: ONBOARDING_VERSION,
    database: engine,
  });
};

export const trackAddDataLaterClicked = (engine?: string) => {
  trackSchemaEvent("setup", SETUP_SCHEMA_VERSION, {
    event: "add_data_later_clicked",
    version: ONBOARDING_VERSION,
    source: engine ? "post_selection" : "pre_selection",
  });
};

export const trackTrackingChanged = (isTrackingAllowed: boolean) => {
  trackSchemaEvent("settings", SETTINGS_SCHEMA_VERSION, {
    event: isTrackingAllowed
      ? "tracking_permission_enabled"
      : "tracking_permission_disabled",
    source: "setup",
  });
};
