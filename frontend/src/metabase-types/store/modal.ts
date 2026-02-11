import type { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import type { LegacyStaticEmbeddingModalProps } from "metabase/embedding/embedding-iframe-sdk-setup/components/LegacyStaticEmbeddingModal";
import type { SdkIframeEmbedSetupModalInitialState } from "metabase/plugins/oss/embedding-iframe-sdk-setup";

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
      props: {
        initialState: LegacyStaticEmbeddingModalProps;
      } | null;
    };
