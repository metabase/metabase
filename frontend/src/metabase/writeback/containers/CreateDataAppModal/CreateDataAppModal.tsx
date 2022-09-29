import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import type { LocationDescriptor } from "history";

import Button from "metabase/core/components/Button";

import * as Urls from "metabase/lib/urls";

import DataApps, { ScaffoldNewAppParams } from "metabase/entities/data-apps";

import DataAppDataPicker from "metabase/writeback/components/DataAppDataPicker";

import type { DataApp, TableId } from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

import {
  ModalRoot,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "./CreateDataAppModal.styled";

interface OwnProps {
  onClose: () => void;
}

interface DispatchProps {
  onCreate: (params: ScaffoldNewAppParams) => Promise<DataApp>;
  onChangeLocation: (location: LocationDescriptor) => void;
}

type Props = OwnProps & DispatchProps;

function mapDispatchToProps(dispatch: Dispatch) {
  return {
    onCreate: async (params: ScaffoldNewAppParams) => {
      const action = await dispatch(
        DataApps.objectActions.scaffoldNewApp(params),
      );
      return DataApps.HACK_getObjectFromAction(action);
    },
    onChangeLocation: (location: LocationDescriptor) =>
      dispatch(push(location)),
  };
}

function CreateDataAppModal({ onCreate, onChangeLocation, onClose }: Props) {
  const [tableId, setTableId] = useState<TableId | null>(null);

  const handleCreate = useCallback(async () => {
    const dataApp = await onCreate({
      name: t`New App`,
      tables: [tableId] as number[],
    });
    onClose();
    onChangeLocation(Urls.dataApp(dataApp));
  }, [tableId, onCreate, onChangeLocation, onClose]);

  return (
    <ModalRoot>
      <ModalHeader>
        <ModalTitle>{t`Pick your starting data`}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <DataAppDataPicker tableId={tableId} onTableChange={setTableId} />
      </ModalBody>
      <ModalFooter>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          primary
          disabled={tableId == null}
          onClick={handleCreate}
        >{t`Create`}</Button>
      </ModalFooter>
    </ModalRoot>
  );
}

export default connect<unknown, DispatchProps, OwnProps, State>(
  null,
  mapDispatchToProps,
)(CreateDataAppModal);
