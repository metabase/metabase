import React, { Fragment } from "react";
import { User, Database } from "../../types";
import SyncSnackbar from "../SyncSnackbar";
import SyncModal from "../SyncModal";

interface Props {
  user?: User;
  databases: Database[];
  showModal?: boolean;
  showXrays?: boolean;
  onHideModal?: () => void;
}

const SyncProgress = ({
  user,
  databases,
  showModal,
  showXrays,
  onHideModal,
}: Props) => {
  if (!user?.is_superuser) {
    return null;
  }

  return (
    <Fragment>
      <SyncSnackbar user={user} databases={databases} />
      <SyncModal
        databases={databases}
        showModal={showModal}
        showXrays={showXrays}
        onHideModal={onHideModal}
      />
    </Fragment>
  );
};

export default SyncProgress;
