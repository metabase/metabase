import type { LocationDescriptor } from "history";
import { useCallback } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Modal } from "metabase/ui";
import type { Collection } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type { CreateCollectionFormOwnProps } from "../components/CreateCollectionForm";
import { CreateCollectionForm } from "../components/CreateCollectionForm";

interface CreateCollectionModalOwnProps
  extends Omit<CreateCollectionFormOwnProps, "onCancel"> {
  onClose: () => void;
}

interface CreateCollectionModalDispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
}

type Props = CreateCollectionModalOwnProps & CreateCollectionModalDispatchProps;

const mapDispatchToProps = {
  onChangeLocation: push,
};

function CreateCollectionModal({
  onCreate,
  onChangeLocation,
  onClose,
  ...props
}: Props) {
  const handleCreate = useCallback(
    (collection: Collection) => {
      if (typeof onCreate === "function") {
        onCreate(collection);
      } else {
        onClose();
        onChangeLocation(Urls.collection(collection));
      }
    },
    [onCreate, onChangeLocation, onClose],
  );

  return (
    <Modal.Root
      opened
      onClose={onClose}
      size="lg"
      data-testid="new-collection-modal"
    >
      <Modal.Overlay />
      <Modal.Content p="md">
        <Modal.Header>
          <Modal.Title>{t`New collection`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <CreateCollectionForm
            {...props}
            onCreate={handleCreate}
            onCancel={onClose}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
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
