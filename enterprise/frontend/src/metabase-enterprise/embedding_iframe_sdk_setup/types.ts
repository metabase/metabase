export type EmbedType = "dashboard" | "chart" | "exploration";

export type Step =
  | "select-embed-type"
  | "select-entity"
  | "configure"
  | "get-code";

export interface EmbedParameter {
  id: string;
  name: string;
  placeholder: string;
}

export interface StepProps {
  onNext: () => void;
  onBack: () => void;
  canGoNext: boolean;
  canGoBack: boolean;
}
