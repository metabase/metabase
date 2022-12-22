import React, { useCallback, useEffect, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button/Button";
import Select, {
  Option,
  SelectChangeEvent,
} from "metabase/core/components/Select";
import ModalContent from "metabase/components/ModalContent";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Tables from "metabase/entities/tables";
import { CardId } from "metabase-types/api";
import { State } from "metabase-types/store";
import Field from "metabase-lib/metadata/Field";
import Table from "metabase-lib/metadata/Table";
import { getQuestionVirtualTableId } from "metabase-lib/metadata/utils/saved-questions";

interface FieldStepModalOwnProps {
  cardId: CardId | undefined;
  fieldReference: unknown[] | undefined;
  onChangeField: (field: unknown[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onClose: () => void;
}

interface FieldStepModalStateProps {
  tableId: string;
  table: Table | undefined;
  loading: boolean;
  error: unknown;
}

interface FieldStepModalDispatchProps {
  onFetchMetadata: ({ id }: { id: string }) => void;
}

type FieldStepModalProps = FieldStepModalOwnProps &
  FieldStepModalStateProps &
  FieldStepModalDispatchProps;

const FieldStepModal = ({
  table,
  tableId,
  loading,
  error,
  fieldReference,
  onFetchMetadata,
  onChangeField,
  onSubmit,
  onCancel,
  onClose,
}: FieldStepModalProps): JSX.Element => {
  const fields = useMemo(() => {
    return table ? getSupportedFields(table) : [];
  }, [table]);

  const selectedField = useMemo(() => {
    return fieldReference && getFieldByReference(fields, fieldReference);
  }, [fields, fieldReference]);

  const handleChange = useCallback(
    (event: SelectChangeEvent<Field>) => {
      onChangeField(event.target.value.reference());
    },
    [onChangeField],
  );

  useEffect(() => {
    onFetchMetadata({ id: tableId });
  }, [tableId, onFetchMetadata]);

  return (
    <LoadingAndErrorWrapper loading={loading} error={error}>
      {table && (
        <ModalContent
          title={t`Which column from ${table.displayName()} should be used`}
          footer={[
            <Button key="cancel" onClick={onCancel}>{t`Back`}</Button>,
            <Button
              key="submit"
              primary
              disabled={!selectedField}
              onClick={onSubmit}
            >{t`Done`}</Button>,
          ]}
          onClose={onClose}
        >
          <Select
            value={selectedField}
            placeholder={t`Pick a column`}
            onChange={handleChange}
          >
            {fields.map((field, index) => (
              <Option key={index} name={field.displayName()} value={field} />
            ))}
          </Select>
        </ModalContent>
      )}
    </LoadingAndErrorWrapper>
  );
};

const getFieldByReference = (fields: Field[], fieldReference: unknown[]) => {
  return fields.find(field => _.isEqual(field.reference(), fieldReference));
};

const getSupportedFields = (table: Table) => {
  return table.fields.filter(field => field.isString());
};

const mapStateToProps = (state: State, { cardId }: FieldStepModalOwnProps) => {
  const tableId = getQuestionVirtualTableId({ id: cardId });
  const options = { entityId: tableId, requestType: "fetchMetadata" };

  return {
    tableId,
    table: Tables.selectors.getObject(state, options),
    loading: Tables.selectors.getLoading(state, options),
    error: Tables.selectors.getError(state, options),
  };
};

const mapDispatchToProps = {
  onFetchMetadata: Tables.actions.fetchMetadata,
};

export default connect(mapStateToProps, mapDispatchToProps)(FieldStepModal);
