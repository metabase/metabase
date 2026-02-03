import type { LocationDescriptor } from "history";
import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import { Collections } from "metabase/entities/collections";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Modal } from "metabase/ui";
import type { Collection } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { CreateCollectionFormOwnProps } from "../components/CreateCollectionForm";
import { CreateCollectionForm } from "../components/CreateCollectionForm";
import type { CreateCollectionProperties } from "../components/CreateCollectionForm/CreateCollectionForm";

interface CreateCollectionModalOwnProps
  extends Omit<CreateCollectionFormOwnProps, "onCancel" | "onSubmit"> {
  onCreate?: (collection: Collection) => void;
  onClose: () => void;
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
  ...props
}: Props) {
  const handleCreate = useCallback(
    async (values: CreateCollectionProperties) => {
      const action = await handleCreateCollection(values);
      const collection = Collections.HACK_getObjectFromAction(action);

      if (typeof onCreate === "function") {
        onCreate(collection);
      } else {
        onClose();
        onChangeLocation(Urls.collection(collection));
      }
    },
    [onCreate, onChangeLocation, onClose, handleCreateCollection],
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
