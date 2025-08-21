import type { IconName } from "metabase/ui";

export type EmbeddingStepId =
  | "test-embed"
  | "add-data"
  | "create-dashboard"
  | "configure-sandboxing"
  | "secure-embeds"
  | "embed-production";

export interface EmbeddingStep {
  id: EmbeddingStepId;
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
    href?: string;
    to?: string;
    variant?: "outline" | "subtle" | "filled";
    adminOnly?: boolean;
    showWhenMetabaseLinksEnabled?: boolean;
  }>;
}
