import type { IconName } from "metabase/ui";

export type EmbeddingHubStepId =
  | "create-test-embed"
  | "add-data"
  | "create-dashboard"
  | "configure-sandboxing"
  | "secure-embeds"
  | "embed-production";

export interface EmbeddingHubStep {
  id: EmbeddingHubStepId;
  title: string;
  icon: IconName;
  description: string;
  image?: {
    src: string;
    srcSet?: string;
    alt: string;
  };
  actions?: Array<{
    label: string;
    to?: string;
    docsPath?: string;
    variant?: "outline" | "subtle" | "filled";
  }>;
}
