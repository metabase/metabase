import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button/Button";
import Select, {
  Option,
  SelectChangeEvent,
} from "metabase/core/components/Select";
import ModalContent from "metabase/components/ModalContent";
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

interface FieldStepModalTableProps {
  table: Table;
}

type FieldStepModalProps = FieldStepModalOwnProps & FieldStepModalTableProps;

const FieldStepModal = ({
  table,
  fieldReference,
  onChangeField,
  onSubmit,
  onCancel,
  onClose,
}: FieldStepModalProps): JSX.Element => {
  const fields = useMemo(() => {
    return getSupportedFields(table);
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

  return (
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
  );
};

const getFieldByReference = (fields: Field[], fieldReference: unknown[]) => {
  return fields.find(field => _.isEqual(field.reference(), fieldReference));
};

const getSupportedFields = (table: Table) => {
  return table.fields.filter(field => field.isString());
};

export default Tables.load({
  id: (state: State, { cardId }: FieldStepModalOwnProps) =>
    getQuestionVirtualTableId({ id: cardId }),
  requestType: "fetchMetadata",
})(FieldStepModal);
