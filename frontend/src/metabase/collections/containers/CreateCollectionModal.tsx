import type { LocationDescriptor } from "history";
import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import { Collections } from "metabase/entities/collections";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
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

interface CreateCollectionModalDispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
  handleCreateCollection: (
    collection: CreateCollectionProperties,
  ) => Promise<Collection>;
}

type Props = CreateCollectionModalOwnProps & CreateCollectionModalDispatchProps;

const mapDispatchToProps = {
  onChangeLocation: push,
  handleCreateCollection: Collections.actions.create,
};

function CreateCollectionModal({
  onCreate,
  onChangeLocation,
  onClose,
  handleCreateCollection,
  shouldNavigateOnCreate = true,
  ...props
}: Props) {
  const handleCreate = useCallback(
    async (values: CreateCollectionProperties) => {
      const action = await handleCreateCollection(values);
      const collection: Collection =
        Collections.HACK_getObjectFromAction(action);

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

        onChangeLocation(visitUrl);
      }
    },
    [
      handleCreateCollection,
      onCreate,
      onClose,
      onChangeLocation,
      shouldNavigateOnCreate,
    ],
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
export default connect<
  unknown,
  CreateCollectionModalDispatchProps,
  CreateCollectionModalOwnProps,
  State
>(
  null,
  mapDispatchToProps,
)(CreateCollectionModal);
