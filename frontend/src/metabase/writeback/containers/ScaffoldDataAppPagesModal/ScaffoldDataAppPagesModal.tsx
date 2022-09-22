import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Button from "metabase/core/components/Button";

import DataApps, { ScaffoldNewPagesParams } from "metabase/entities/data-apps";

import DataAppDataPicker from "metabase/writeback/components/DataAppDataPicker";

import type { DataApp, TableId } from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

import {
  ModalRoot,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "./ScaffoldDataAppPagesModal.styled";

interface OwnProps {
  dataAppId: DataApp["id"];
  onAdd: (dataApp: DataApp) => void;
  onClose: () => void;
}

interface DispatchProps {
  onScaffold: (params: ScaffoldNewPagesParams) => Promise<DataApp>;
}

type Props = OwnProps & DispatchProps;

function mapDispatchToProps(dispatch: Dispatch) {
  return {
    onScaffold: async (params: ScaffoldNewPagesParams) => {
      const action = await dispatch(
        DataApps.objectActions.scaffoldNewPages(params),
      );
      return DataApps.HACK_getObjectFromAction(action);
    },
  };
}

function ScaffoldDataAppPagesModal({
  dataAppId,
  onAdd,
  onScaffold,
  onClose,
}: Props) {
  const [tableId, setTableId] = useState<TableId | null>(null);

  const handleAdd = useCallback(async () => {
    const dataApp = await onScaffold({
      dataAppId,
      tables: [tableId] as number[],
    });
    onClose();
    onAdd(dataApp);
  }, [dataAppId, tableId, onAdd, onScaffold, onClose]);

  return (
    <ModalRoot>
      <ModalHeader>
        <ModalTitle>{t`Pick your data`}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <DataAppDataPicker tableId={tableId} onTableChange={setTableId} />
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          primary
          disabled={tableId == null}
          onClick={handleAdd}
        >{t`Add`}</Button>
      </ModalFooter>
    </ModalRoot>
  );
}

export default connect<unknown, DispatchProps, OwnProps, State>(
  null,
  mapDispatchToProps,
)(ScaffoldDataAppPagesModal);
