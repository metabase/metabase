import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import type { LocationDescriptor } from "history";

import Button from "metabase/core/components/Button";

import * as Urls from "metabase/lib/urls";

import DataApps, { ScaffoldAppParams } from "metabase/entities/data-apps";
import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

import type { DataApp } from "metabase-types/api";
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
  onCreate: (params: ScaffoldAppParams) => Promise<DataApp>;
  onChangeLocation: (location: LocationDescriptor) => void;
}

type Props = OwnProps & DispatchProps;

function mapDispatchToProps(dispatch: Dispatch) {
  return {
    onCreate: async (params: ScaffoldAppParams) => {
      const action = await dispatch(DataApps.objectActions.scaffold(params));
      return DataApps.HACK_getObjectFromAction(action);
    },
    onChangeLocation: (location: LocationDescriptor) =>
      dispatch(push(location)),
  };
}

function CreateDataAppModal({ onCreate, onChangeLocation, onClose }: Props) {
  const [tableId, setTableId] = useState<number | null>(null);

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
        <DatabaseSchemaAndTableDataSelector
          selectedTableId={tableId}
          setSourceTableFn={setTableId}
          requireWriteback
          isPopover={false}
        />
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
