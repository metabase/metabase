import type { AddDataTab } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal/utils";

export type EmbeddingHubStepId =
  | "create-test-embed"
  | "add-data"
  | "create-dashboard"
  | "configure-row-column-security"
  | "secure-embeds"
  | "embed-production"
  | "create-models"
  | "setup-tenants"
  | "embed-metabot";

export interface EmbeddingHubStep {
  id: EmbeddingHubStepId;
  title: string;

  actions: EmbeddingHubAction[];
}

export type EmbeddingHubModalToTrigger =
  | { type: "add-data"; initialTab: AddDataTab }
  | { type: "new-dashboard" }
  | { type: "xray-dashboard" }
  | { type: "user-strategy" };

export interface EmbeddingHubAction {
  stepId?: EmbeddingHubStepId;

  title: string;
  description: string;

  /** Internal link to a Metabase route. */
  to?: string;

  /**
   * Click handler
   */
  onClick?: () => void;

  /** Path of the documentation page, e.g. `embedding/embedded-analytics-js` */
  docsPath?: string;

  /** Anchor on the documentation page, e.g. `set-up-sso` */
  anchor?: string;

  /** CTA button variant. */
  variant?: "outline" | "subtle" | "filled";

  /** Which modal to trigger? */
  modal?: EmbeddingHubModalToTrigger;

  optional?: boolean;
}
