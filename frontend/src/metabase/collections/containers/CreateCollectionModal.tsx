import { useCallback } from "react";
import { t } from "ttag";

import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import { Collections } from "metabase/entities/collections";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useNavigation } from "metabase/routing";
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
  handleCreateCollection: (
    collection: CreateCollectionProperties,
  ) => Promise<Collection>;
}

type Props = CreateCollectionModalOwnProps & CreateCollectionModalDispatchProps;

const mapDispatchToProps = {
  handleCreateCollection: Collections.actions.create,
};

function CreateCollectionModal({
  onCreate,
  onClose,
  handleCreateCollection,
  ...props
}: Props) {
  const { push } = useNavigation();
  const handleCreate = useCallback(
    async (values: CreateCollectionProperties) => {
      const action = await handleCreateCollection(values);
      const collection = Collections.HACK_getObjectFromAction(action);

      if (typeof onCreate === "function") {
        onCreate(collection);
      } else {
        onClose();
        push(Urls.collection(collection));
      }
    },
    [onCreate, onClose, handleCreateCollection, push],
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
