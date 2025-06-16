export type EmbedType = "dashboard" | "chart" | "exploration";

export type Step =
  | "select-embed-type"
  | "select-entity"
  | "configure"
  | "get-code";

export interface StepProps {
  onNext: () => void;
  onBack: () => void;
}
