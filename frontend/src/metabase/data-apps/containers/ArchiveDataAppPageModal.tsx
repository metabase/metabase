import React, { useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import ArchiveModal from "metabase/components/ArchiveModal";

import {
  archiveDataAppPage,
  ArchiveDataAppPagePayload,
} from "metabase/data-apps/actions";

import type { DataApp, DataAppPage } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface OwnProps {
  appId: DataApp["id"];
  pageId: DataAppPage["id"];
  onArchive?: () => void;
  onClose: () => void;
}

interface DispatchProps {
  archiveDataAppPage: (payload: ArchiveDataAppPagePayload) => Promise<void>;
}

type Props = OwnProps & DispatchProps;

const mapDispatchToProps = {
  archiveDataAppPage,
};

function ArchiveDataAppPageModal({
  appId,
  pageId,
  archiveDataAppPage,
  onArchive,
  onClose,
}: Props) {
  const handleArchive = useCallback(async () => {
    await archiveDataAppPage({ appId, pageId });
    onArchive?.();
    onClose();
  }, [appId, pageId, archiveDataAppPage, onArchive, onClose]);

  return (
    <ArchiveModal
      title={t`Archive this page?`}
      message={t`All of its sub-pages will also to archived.`}
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
)(ArchiveDataAppPageModal);
