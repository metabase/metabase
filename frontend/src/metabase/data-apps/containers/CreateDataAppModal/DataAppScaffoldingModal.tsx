import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import type { LocationDescriptor } from "history";

import Button from "metabase/core/components/Button";
import {
  getResponseErrorMessage,
  GenericErrorResponse,
} from "metabase/core/utils/errors";

import * as Urls from "metabase/lib/urls";

import DataPicker, {
  useDataPicker,
  useDataPickerValue,
  DataPickerValue,
} from "metabase/containers/DataPicker";
import {
  scaffoldDataApp,
  ScaffoldNewAppParams,
} from "metabase/data-apps/actions";
import DataAppScaffoldingDataPicker from "metabase/data-apps/components/DataAppScaffoldingDataPicker";

import type { DataApp } from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

import {
  ModalRoot,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalFooterContent,
  SearchInputContainer,
  SearchInput,
  SearchIcon,
  ErrorMessage,
} from "./DataAppScaffoldingModal.styled";

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
    onCreate: (params: ScaffoldNewAppParams) =>
      dispatch(scaffoldDataApp(params)),
    onChangeLocation: (location: LocationDescriptor) =>
      dispatch(push(location)),
  };
}

function getSearchInputPlaceholder(value: DataPickerValue) {
  if (value?.type === "models") {
    return t`Search for a model…`;
  }
  if (value?.type === "raw-data") {
    return t`Search for a table…`;
  }
  return t`Search for some data…`;
}

function DataPickerSearchInput({ value }: { value: DataPickerValue }) {
  const { search } = useDataPicker();

  return (
    <SearchInputContainer>
      <SearchIcon name="search" size={16} />
      <SearchInput
        value={search.query}
        onChange={e => search.setQuery(e.target.value)}
        placeholder={getSearchInputPlaceholder(value)}
      />
    </SearchInputContainer>
  );
}

function DataAppScaffoldingModal({
  onCreate,
  onChangeLocation,
  onClose,
}: Props) {
  const [value, setValue] = useDataPickerValue();
  const [error, setError] = useState("");

  const { tableIds } = value;

  const handleValueChange = useCallback(
    nextValue => {
      setValue(nextValue);
      setError("");
    },
    [setValue],
  );

  const handleCreate = useCallback(async () => {
    try {
      const dataApp = await onCreate({
        name: t`New App`,
        tables: tableIds as number[],
      });
      onClose();
      onChangeLocation(Urls.dataApp(dataApp));
    } catch (error) {
      const response = error as GenericErrorResponse;
      setError(getResponseErrorMessage(response) ?? t`An error occurred`);
    }
  }, [tableIds, onCreate, onChangeLocation, onClose]);

  const hasError = error.length > 0;
  const canSubmit = tableIds.length > 0 && !hasError;

  return (
    <DataPicker.Provider>
      <ModalRoot>
        <ModalHeader>
          <ModalTitle>{t`Pick your starting data`}</ModalTitle>
          <DataPickerSearchInput value={value} />
        </ModalHeader>
        <ModalBody>
          <DataAppScaffoldingDataPicker
            value={value}
            onChange={handleValueChange}
          />
        </ModalBody>
        <ModalFooter>
          <ModalFooterContent>
            {hasError && <ErrorMessage>{error}</ErrorMessage>}
          </ModalFooterContent>
          <ModalFooterContent>
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <Button
              primary
              disabled={!canSubmit}
              onClick={handleCreate}
            >{t`Create`}</Button>
          </ModalFooterContent>
        </ModalFooter>
      </ModalRoot>
    </DataPicker.Provider>
  );
}

export default connect<unknown, DispatchProps, OwnProps, State>(
  null,

  // Need to figure out how to properly type curried actions
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  mapDispatchToProps,
)(DataAppScaffoldingModal);
