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
  fieldRef: unknown[] | undefined;
  onChangeField: (fieldRef: unknown[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onClose: () => void;
}

interface FieldStepModalStateProps {
  table: Table | undefined;
}

interface FieldStepModalDispatchProps {
  onFetchMetadata: ({ id }: { id: string }) => void;
}

type FieldStepModalProps = FieldStepModalOwnProps &
  FieldStepModalStateProps &
  FieldStepModalDispatchProps;

const FieldStepModal = ({
  cardId,
  table,
  fieldRef,
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
    return fieldRef && getFieldByRef(fields, fieldRef);
  }, [fields, fieldRef]);

  useEffect(() => {
    onFetchMetadata({ id: getQuestionVirtualTableId({ id: cardId }) });
  }, [cardId, onFetchMetadata]);

  const handleChange = useCallback(
    (event: SelectChangeEvent<Field>) => {
      onChangeField(event.target.value.reference());
    },
    [onChangeField],
  );

  return (
    <LoadingAndErrorWrapper loading={!table}>
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

const getFieldByRef = (fields: Field[], fieldRef: unknown[]) => {
  return fields.find(field => _.isEqual(field.reference(), fieldRef));
};

const getSupportedFields = (table: Table) => {
  return table.fields.filter(field => field.isString());
};

const mapStateToProps = (state: State, { cardId }: FieldStepModalOwnProps) => ({
  table: Tables.selectors.getObject(state, {
    entityId: getQuestionVirtualTableId({ id: cardId }),
  }),
});

const mapDispatchToProps = {
  onFetchMetadata: Tables.actions.fetchMetadata,
};

export default connect(mapStateToProps, mapDispatchToProps)(FieldStepModal);
