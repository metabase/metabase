import React, { useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import ArchiveModal from "metabase/components/ArchiveModal";

import {
  archiveDataApp,
  ArchiveDataAppPayload,
} from "metabase/data-apps/actions";

import type { DataApp } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface OwnProps {
  appId: DataApp["id"];
  onArchive?: () => void;
  onClose: () => void;
}

interface DispatchProps {
  archiveDataApp: (payload: ArchiveDataAppPayload) => Promise<void>;
}

type Props = OwnProps & DispatchProps;

const mapDispatchToProps = {
  archiveDataApp,
};

function ArchiveDataAppModal({
  appId,
  archiveDataApp,
  onArchive,
  onClose,
}: Props) {
  const handleArchive = useCallback(async () => {
    await archiveDataApp({ id: appId });
    onArchive?.();
    onClose();
  }, [appId, archiveDataApp, onArchive, onClose]);

  return (
    <ArchiveModal
      title={t`Archive this app?`}
      message={t`The pages, questions, and models in this app will also be archived.`}
      onArchive={handleArchive}
      onClose={onClose}
    />
  );
}

export default connect<unknown, DispatchProps, OwnProps, State>(
  null,

  // Need to figure out how to properly type curried actions
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  mapDispatchToProps,
)(ArchiveDataAppModal);
