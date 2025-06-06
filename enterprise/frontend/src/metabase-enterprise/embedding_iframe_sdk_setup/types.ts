import type {
  DashboardEmbedOptions,
  QuestionEmbedOptions,
} from "metabase-enterprise/embedding_iframe_sdk/types/embed";

export type EmbedType = "dashboard" | "chart" | "exploration";

export type Step = "select-type" | "select-entity" | "configure" | "get-code";

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

// Dashboard-specific settings
type DashboardSettings = Pick<
  DashboardEmbedOptions,
  | "isDrillThroughEnabled"
  | "withTitle"
  | "withDownloads"
  | "initialParameters"
  | "hiddenParameters"
>;

// Question-specific settings
type QuestionSettings = Pick<
  QuestionEmbedOptions,
  | "isDrillThroughEnabled"
  | "withTitle"
  | "withDownloads"
  | "initialSqlParameters"
>;

export interface EmbedPreviewOptions {
  selectedType: EmbedType;
  selectedDashboard: number | null;
  selectedQuestion: number | null;

  // Dashboard options (optional since they only apply to dashboard embeds)
  dashboardOptions?: DashboardSettings;

  // Question options (optional since they only apply to question embeds)
  questionOptions?: QuestionSettings;

  // Theme colors for preview
  colors?: {
    brand?: string;
    "text-primary"?: string;
    background?: string;
  };
}

export interface StepProps {
  onNext: () => void;
  onBack: () => void;
  canGoNext: boolean;
  canGoBack: boolean;
}
