import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button/Button";
import Select, {
  Option,
  SelectChangeEvent,
} from "metabase/core/components/Select";
import ModalContent from "metabase/components/ModalContent";
import QuestionResultLoader from "metabase/containers/QuestionResultLoader";
import Visualization from "metabase/visualizations/components/Visualization/Visualization";
import Tables from "metabase/entities/tables";
import { CardId } from "metabase-types/api";
import { State } from "metabase-types/store";
import Field from "metabase-lib/metadata/Field";
import Table from "metabase-lib/metadata/Table";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { getQuestionVirtualTableId } from "metabase-lib/metadata/utils/saved-questions";
import { ModalBody, ModalCaption } from "./FieldStepModal.styled";

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

interface QuestionResultLoaderProps {
  rawSeries: unknown[];
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

  const field = useMemo(() => {
    return fieldReference && getFieldByReference(fields, fieldReference);
  }, [fields, fieldReference]);

  const question = useMemo(() => {
    return field && getFieldQuestion(table, field);
  }, [table, field]);

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
          disabled={!field}
          onClick={onSubmit}
        >{t`Done`}</Button>,
      ]}
      onClose={onClose}
    >
      <ModalBody>
        <ModalCaption>
          <Select
            value={field}
            placeholder={t`Pick a column`}
            onChange={handleChange}
          >
            {fields.map((field, index) => (
              <Option key={index} name={field.displayName()} value={field} />
            ))}
          </Select>
        </ModalCaption>
        <QuestionResultLoader question={question}>
          {({ rawSeries }: QuestionResultLoaderProps) =>
            rawSeries && <Visualization rawSeries={rawSeries} isDashboard />
          }
        </QuestionResultLoader>
      </ModalBody>
    </ModalContent>
  );
};

const getFieldQuestion = (table: Table, field: Field) => {
  const query = table.question().query();

  if (query instanceof StructuredQuery) {
    return query.setFields([field.reference()]).question();
  } else {
    return query.question();
  }
};

const getFieldByReference = (fields: Field[], fieldReference: unknown[]) => {
  return fields.find(field => _.isEqual(field.reference(), fieldReference));
};

const getSupportedFields = (table: Table) => {
  return table.fields.filter(field => field.isString());
};

export default Tables.load({
  id: (state: State, { cardId }: FieldStepModalOwnProps) =>
    getQuestionVirtualTableId(cardId),
  requestType: "fetchMetadata",
})(FieldStepModal);
