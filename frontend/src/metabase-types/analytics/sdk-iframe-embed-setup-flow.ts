import type { ValidateSimpleEvent as ValidateEvent } from "./simple-event";

export type SdkIframeEmbedSetupExperience =
  | "dashboard"
  | "chart"
  | "exploration";

export type EmbedWizardExperienceSelectedEvent = ValidateEvent<{
  event: "embed_wizard_experience_selected";
  event_detail: SdkIframeEmbedSetupExperience;
}>;

export type EmbedWizardResourceSelectedEvent = ValidateEvent<{
  event: "embed_wizard_resource_selected";
  event_detail: SdkIframeEmbedSetupExperience;
  target_id: number;
}>;

export type EmbedWizardOptionChangedEvent = ValidateEvent<{
  event: "embed_wizard_option_changed";
  event_detail: string;
}>;

export type EmbedWizardAuthSelectedEvent = ValidateEvent<{
  event: "embed_wizard_auth_selected";
  event_detail: "sso" | "user-session";
}>;

export type EmbedWizardCodeCopiedEvent = ValidateEvent<{
  event: "embed_wizard_code_copied";
}>;

export type EmbedWizardEvent =
  | EmbedWizardExperienceSelectedEvent
  | EmbedWizardResourceSelectedEvent
  | EmbedWizardOptionChangedEvent
  | EmbedWizardAuthSelectedEvent
  | EmbedWizardCodeCopiedEvent;
