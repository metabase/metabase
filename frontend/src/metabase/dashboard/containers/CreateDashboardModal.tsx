import { useCallback, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import type { LocationDescriptor } from "history";

import ModalContent from "metabase/components/ModalContent";

import * as Urls from "metabase/lib/urls";

import type { Dashboard, Collection, CollectionId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import CreateDashboardForm, {
  CreateDashboardFormOwnProps,
  StagedDashboard,
} from "./CreateDashboardForm";

interface CreateDashboardModalOwnProps
  extends Omit<CreateDashboardFormOwnProps, "onCancel"> {
  onClose?: () => void;
}

interface CreateDashboardModalDispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
}

type Props = CreateDashboardModalOwnProps & CreateDashboardModalDispatchProps;

const mapDispatchToProps = {
  onChangeLocation: push,
};

function CreateDashboardModal({
  onCreate,
  onChangeLocation,
  onClose,
  ...props
}: Props) {
  const handleCreate = useCallback(
    (dashboard: Dashboard) => {
      if (typeof onCreate === "function") {
        onCreate(dashboard);
      } else {
        onClose?.();
        onChangeLocation(Urls.dashboard(dashboard, { editMode: true }));
      }
    },
    [onCreate, onChangeLocation, onClose],
  );

  const [creatingNewCollection, setCreatingNewCollection] = useState(false);
  const [openCollectionId, setOpenCollectionId] = useState<CollectionId>();
  const [stagedDashboard, setStagedDashboard] =
    useState<StagedDashboard | null>(null);
  const saveToNewCollection = (s: StagedDashboard) => {
    setCreatingNewCollection(true);
    setOpenCollectionId(s.openCollectionId);
    setStagedDashboard(s);
  };

  if (creatingNewCollection && stagedDashboard) {
    return (
      <CreateCollectionModal
        collectionId={openCollectionId}
        onClose={() => setCreatingNewCollection(false)}
        onCreate={(collection: Collection) => {
          const { values, handleCreate } = stagedDashboard;
          handleCreate({ ...values, collection_id: collection.id });
        }}
      />
    );
  }

  return (
    <ModalContent title={t`New dashboard`} onClose={onClose}>
      <CreateDashboardForm
        {...props}
        onCreate={handleCreate}
        onCancel={onClose}
        saveToNewCollection={saveToNewCollection}
        initialValues={stagedDashboard?.values}
      />
    </ModalContent>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<
  unknown,
  CreateDashboardModalDispatchProps,
  CreateDashboardModalOwnProps,
  State
>(
  null,
  mapDispatchToProps,
)(CreateDashboardModal);
