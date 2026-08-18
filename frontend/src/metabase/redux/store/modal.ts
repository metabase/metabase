import type { DashboardId, EmbeddingType } from "metabase-types/api";

export const STATIC_LEGACY_EMBEDDING_TYPE =
  "static-legacy" satisfies EmbeddingType;

export type SdkIframeEmbedSetupModalInitialState = {
  resourceType?: string | null;
  resourceId?: string | number | null;
  isGuest?: boolean;
  useExistingUserSession?: boolean;
};

export type SdkIframeEmbedSetupExperience =
  | "dashboard"
  | "chart"
  | "exploration"
  | "browser"
  | "metabot";

export type LegacyStaticEmbeddingModalProps = {
  experience: SdkIframeEmbedSetupExperience;
  dashboardId?: DashboardId | null;
  questionId?: string | number | null;
  parentInitialState: SdkIframeEmbedSetupModalInitialState;
};

export type ModalName =
  | null
  | "collection"
  | "dashboard"
  | "action"
  | "help"
  | "embed"
  | "upgrade"
  | typeof STATIC_LEGACY_EMBEDDING_TYPE;

export type ModalState<TProps = Record<string, unknown>> =
  | {
      id: Exclude<ModalName, "embed" | "static-legacy">;
      props: TProps | null;
    }
  | {
      id: "embed";
      props: {
        initialState: SdkIframeEmbedSetupModalInitialState;
      } | null;
    }
  | {
      id: "static-legacy";
      props: LegacyStaticEmbeddingModalProps | null;
    };
