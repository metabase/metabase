import { useCallback } from "react";
import { t } from "ttag";

import { useCreateCollectionMutation } from "metabase/api";
import { getCollectionPathAsArray } from "metabase/common/collections/utils";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useNavigate } from "metabase/router";
import { Modal } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

import type { CreateCollectionFormOwnProps } from "../components/CreateCollectionForm";
import { CreateCollectionForm } from "../components/CreateCollectionForm";
import type { CreateCollectionProperties } from "../components/CreateCollectionForm/CreateCollectionForm";

export interface CreateCollectionModalOwnProps extends Omit<
  CreateCollectionFormOwnProps,
  "onCancel" | "onSubmit"
> {
  onCreate?: (collection: Collection) => void;
  onClose: () => void;
  shouldNavigateOnCreate?: boolean;
}

function CreateCollectionModal({
  onCreate,
  onClose,
  shouldNavigateOnCreate = true,
  ...props
}: CreateCollectionModalOwnProps) {
  const navigate = useNavigate();
  const [createCollection] = useCreateCollectionMutation();

  const handleCreate = useCallback(
    async (values: CreateCollectionProperties) => {
      const collection = await createCollection(values).unwrap();

      if (typeof onCreate === "function") {
        onCreate(collection);
        onClose();
      } else {
        onClose();

        if (!shouldNavigateOnCreate) {
          return;
        }

        navigate(getCreatedCollectionUrl(collection));
      }
    },
    [createCollection, onCreate, onClose, shouldNavigateOnCreate, navigate],
  );

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      data-testid="new-collection-modal"
      padding="40px"
      title={t`New collection`}
    >
      <CreateCollectionForm
        {...props}
        onSubmit={handleCreate}
        onCancel={onClose}
      />
    </Modal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CreateCollectionModal;

// The Library root is a top-level collection and its sections are its direct
// children, so a section's own folders start this deep in a collection's path
const LIBRARY_SECTION_FOLDER_DEPTH = 2;

export function getCreatedCollectionUrl(collection: Collection): string {
  const expandedIds = getCollectionPathAsArray(collection);
  if (collection.namespace === "snippets") {
    return Urls.dataStudioSnippets({ expandedIds });
  }
  if (collection.namespace === "data-actions") {
    return Urls.dataStudioActions({ expandedIds });
  }
  // The Dashboards page lists the section's contents, so only its folders are rows there
  if (collection.type === "library-dashboards") {
    return Urls.dataStudioDashboards({
      expandedIds: expandedIds.slice(LIBRARY_SECTION_FOLDER_DEPTH),
    });
  }
  if (PLUGIN_LIBRARY.isLibraryCollectionType(collection.type)) {
    return Urls.dataStudioLibrary({ expandedIds });
  }
  return Urls.collection(collection);
}
