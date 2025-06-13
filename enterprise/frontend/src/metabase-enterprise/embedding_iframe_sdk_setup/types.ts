import type { SdkIframeEmbedSettings } from "metabase-enterprise/embedding_iframe_sdk/types/embed";

export type EmbedType = "dashboard" | "chart" | "exploration";
export type Step =
  | "select-embed-type"
  | "select-entity"
  | "configure"
  | "get-code";

export interface Dashboard {
  id: number;
  name: string;
  description: string;
  updatedAt: string;
}

export interface Question {
  id: number;
  name: string;
  description: string;
  updatedAt: string;
}

export interface EmbedParameter {
  id: string;
  name: string;
  placeholder: string;
}

export interface EmbedPreviewOptions {
  selectedType: EmbedType;
  settings: SdkIframeEmbedSettings;
}

export interface StepProps {
  onNext: () => void;
  onBack: () => void;
  canGoNext: boolean;
  canGoBack: boolean;
}
