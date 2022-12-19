import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Button from "metabase/core/components/Button";
import {
  getResponseErrorMessage,
  GenericErrorResponse,
} from "metabase/core/utils/errors";

import { useDataPickerValue } from "metabase/containers/DataPicker";

import {
  scaffoldDataAppPages,
  ScaffoldNewPagesParams,
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
  ErrorMessage,
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
    onScaffold: (params: ScaffoldNewPagesParams) =>
      dispatch(scaffoldDataAppPages(params)),
  };
}

function ScaffoldDataAppPagesModal({
  dataAppId,
  onAdd,
  onScaffold,
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

  const handleAdd = useCallback(async () => {
    try {
      const dataApp = await onScaffold({
        dataAppId,
        tables: tableIds as number[],
      });
      onClose();
      onAdd(dataApp);
    } catch (error) {
      const response = error as GenericErrorResponse;
      setError(getResponseErrorMessage(response) ?? t`An error occurred`);
    }
  }, [dataAppId, tableIds, onAdd, onScaffold, onClose]);

  const hasError = error.length > 0;
  const canSubmit = tableIds.length > 0 && !hasError;

  return (
    <ModalRoot>
      <ModalHeader>
        <ModalTitle>{t`Pick your data`}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <DataAppScaffoldingDataPicker value={value} onChange={setValue} />
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
            onClick={handleAdd}
          >{t`Add`}</Button>
        </ModalFooterContent>
      </ModalFooter>
    </ModalRoot>
  );
}

export default connect<unknown, DispatchProps, OwnProps, State>(
  null,

  // Need to figure out how to properly type curried actions
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  mapDispatchToProps,
)(ScaffoldDataAppPagesModal);
