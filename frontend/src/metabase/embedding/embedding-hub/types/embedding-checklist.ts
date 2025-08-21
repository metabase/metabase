import type { AddDataTab } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal/utils";
import type { IconName } from "metabase/ui";

export type EmbeddingHubStepId =
  | "create-test-embed"
  | "add-data"
  | "create-dashboard"
  | "configure-row-column-security"
  | "secure-embeds"
  | "embed-production";

export interface EmbeddingHubStep {
  id: EmbeddingHubStepId;
  title: string;
  icon: IconName;
  description: string;

  image?: EmbeddingHubImage;
  video?: EmbeddingHubVideo;
  actions?: EmbeddingHubAction[];
}

export type EmbeddingHubModalToTrigger =
  | { type: "add-data"; initialTab: AddDataTab }
  | { type: "new-dashboard" };

interface EmbeddingHubAction {
  label: string;

  /** Internal link to a Metabase route. */
  to?: string;

  /** Path of the documentation page, e.g. `embedding/embedded-analytics-js` */
  docsPath?: string;

  /** CTA button variant. */
  variant?: "outline" | "subtle" | "filled";

  /** Which modal to trigger? */
  modal?: EmbeddingHubModalToTrigger;
}

interface EmbeddingHubImage {
  src: string;
  srcSet?: string;
  alt: string;
}

export interface EmbeddingHubVideo {
  id: string;
  trackingId: string;
  title: string;
}
