import type { AddDataTab } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal/utils";

export type SetupGuideStepId =
  | "create-test-embed"
  | "add-data"
  | "create-dashboard"
  | "configure-row-column-security"
  | "sso-configured"
  | "embed-production"
  | "data-permissions-and-enable-tenants"
  // Embedding hub-only steps. The home-page stepper never renders these; it maps its own
  // step list and simply never looks them up.
  | "create-custom-theme"
  | "configure-ai";

export interface SetupGuideStep {
  id: SetupGuideStepId;
  title: string;

  actions: SetupGuideAction[];
}

export type SetupGuideModalToTrigger =
  | { type: "add-data"; initialTab: AddDataTab }
  | { type: "new-dashboard" }
  | { type: "xray-dashboard" }
  | { type: "user-strategy" };

export interface SetupGuideAction {
  stepId?: SetupGuideStepId;

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
  modal?: SetupGuideModalToTrigger;

  optional?: boolean;
}
