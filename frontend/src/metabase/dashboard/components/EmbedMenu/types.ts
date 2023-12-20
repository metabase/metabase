import type { Dashboard } from "metabase-types/api";
import type Question from "metabase-lib/Question";

export type EmbedMenuModes =
  | "embed-menu"
  | "embed-modal"
  | "public-link-popover"
  | "embedding-disabled"
  | null;

export type ResourceType =
  | {
      resource: Dashboard;
      resourceType: "dashboard";
    }
  | {
      resource: Question;
      resourceType: "question";
    };

export type EmbedMenuProps = ResourceType & {
  hasPublicLink: boolean;
  onModalOpen: () => void;
};
