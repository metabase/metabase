import React, { useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import type { LocationDescriptor } from "history";

import Button from "metabase/core/components/Button";

import * as Urls from "metabase/lib/urls";

import DataApps, { ScaffoldNewAppParams } from "metabase/entities/data-apps";

import DataPicker, {
  useDataPicker,
  useDataPickerValue,
} from "metabase/containers/DataPicker";
import DataAppScaffoldingDataPicker from "metabase/writeback/components/DataAppScaffoldingDataPicker";

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

function DataPickerSearchInput() {
  const { search } = useDataPicker();
  return (
    <input
      value={search.query}
      onChange={e => search.setQuery(e.target.value)}
      placeholder={t`Search`}
    />
  );
}

function CreateDataAppModal({ onCreate, onChangeLocation, onClose }: Props) {
  const [value, setValue] = useDataPickerValue();

  const { tableIds } = value;

  const handleCreate = useCallback(async () => {
    const dataApp = await onCreate({
      name: t`New App`,
      tables: tableIds as number[],
    });
    onClose();
    onChangeLocation(Urls.dataApp(dataApp));
  }, [tableIds, onCreate, onChangeLocation, onClose]);

  const canSubmit = tableIds.length > 0;

  return (
    <DataPicker.Provider>
      <ModalRoot>
        <ModalHeader>
          <ModalTitle>{t`Pick your starting data`}</ModalTitle>
          <DataPickerSearchInput />
        </ModalHeader>
        <ModalBody>
          <DataAppScaffoldingDataPicker value={value} onChange={setValue} />
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            primary
            disabled={!canSubmit}
            onClick={handleCreate}
          >{t`Create`}</Button>
        </ModalFooter>
      </ModalRoot>
    </DataPicker.Provider>
  );
}

export default connect<unknown, DispatchProps, OwnProps, State>(
  null,
  mapDispatchToProps,
)(CreateDataAppModal);
