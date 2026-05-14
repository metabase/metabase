import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateCollectionMutation } from "metabase/api";
import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { Modal } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

import type { CreateCollectionFormOwnProps } from "../components/CreateCollectionForm";
import { CreateCollectionForm } from "../components/CreateCollectionForm";
import type { CreateCollectionProperties } from "../components/CreateCollectionForm/CreateCollectionForm";
import { getCollectionPathAsArray } from "../utils";

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
  const dispatch = useDispatch();
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

        let visitUrl = Urls.collection(collection);

        if (
          PLUGIN_LIBRARY.isLibraryCollectionType(collection.type) ||
          collection.namespace === "snippets"
        ) {
          visitUrl = Urls.dataStudioLibrary({
            expandedIds: getCollectionPathAsArray(collection),
          });
        }

        dispatch(push(visitUrl));
      }
    },
    [createCollection, dispatch, onCreate, onClose, shouldNavigateOnCreate],
  );

  useEscapeToCloseModal(onClose);

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      data-testid="new-collection-modal"
      padding="40px"
      title={t`New collection`}
      closeOnEscape={false}
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
