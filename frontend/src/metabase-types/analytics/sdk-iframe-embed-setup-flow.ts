import type { ValidateSimpleEvent as ValidateEvent } from "./simple-event";

export type SdkIframeEmbedSetupExperience =
  | "dashboard"
  | "chart"
  | "exploration";

export type EmbedWizardExperienceSelectedEvent = ValidateEvent<{
  event: "embed_wizard_experience_selected";
  event_detail: SdkIframeEmbedSetupExperience;
  triggered_from: "embed_wizard";
}>;

export type EmbedWizardResourceSelectedEvent = ValidateEvent<{
  event: "embed_wizard_resource_selected";
  target_id: number;
  event_detail: SdkIframeEmbedSetupExperience;
  triggered_from: "embed_wizard";
}>;

export type EmbedWizardOptionChangedEvent = ValidateEvent<{
  event: "embed_wizard_option_changed";
  event_detail: string;
  triggered_from: "embed_wizard";
}>;

export type EmbedWizardAuthSelectedEvent = ValidateEvent<{
  event: "embed_wizard_auth_selected";
  event_detail: "sso" | "user-session";
  triggered_from: "embed_wizard";
}>;

export type EmbedWizardCodeCopiedEvent = ValidateEvent<{
  event: "embed_wizard_code_copied";
  triggered_from: "embed_wizard";
}>;

export type EmbedWizardEvent =
  | EmbedWizardExperienceSelectedEvent
  | EmbedWizardResourceSelectedEvent
  | EmbedWizardOptionChangedEvent
  | EmbedWizardAuthSelectedEvent
  | EmbedWizardCodeCopiedEvent;
