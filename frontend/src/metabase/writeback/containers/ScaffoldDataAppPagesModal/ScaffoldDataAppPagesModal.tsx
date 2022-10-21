import React, { useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Button from "metabase/core/components/Button";

import DataApps, { ScaffoldNewPagesParams } from "metabase/entities/data-apps";

import { useDataPickerValue } from "metabase/containers/DataPicker";
import DataAppScaffoldingDataPicker from "metabase/writeback/components/DataAppScaffoldingDataPicker";

import type { DataApp } from "metabase-types/api";
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
  const [value, setValue] = useDataPickerValue();
  const { tableIds } = value;

  const handleAdd = useCallback(async () => {
    const dataApp = await onScaffold({
      dataAppId,
      tables: tableIds as number[],
    });
    onClose();
    onAdd(dataApp);
  }, [dataAppId, tableIds, onAdd, onScaffold, onClose]);

  const canSubmit = tableIds.length > 0;

  return (
    <ModalRoot>
      <ModalHeader>
        <ModalTitle>{t`Pick your data`}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <DataAppScaffoldingDataPicker value={value} onChange={setValue} />
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          primary
          disabled={!canSubmit}
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
