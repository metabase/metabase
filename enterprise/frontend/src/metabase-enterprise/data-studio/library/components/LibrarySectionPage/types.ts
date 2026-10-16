import type { CollectionId } from "metabase-types/api";

export type LibrarySectionCreateModalProps = {
  opened: boolean;
  collectionId: CollectionId;
  onClose: () => void;
};
