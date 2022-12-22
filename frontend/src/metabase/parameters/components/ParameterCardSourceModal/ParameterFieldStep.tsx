import React, { useCallback } from "react";
import { connect } from "react-redux";
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
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import { getQuestionVirtualTableId } from "metabase-lib/metadata/utils/saved-questions";

interface ParameterFieldStepOwnProps {
  cardId: CardId | undefined;
  fieldRef: unknown[] | undefined;
  onChangeField: (fieldRef: unknown[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onClose: () => void;
}

interface ParameterFieldStepStateProps {
  table: Table;
}

type ParameterFieldStepProps = ParameterFieldStepOwnProps &
  ParameterFieldStepStateProps;

const ParameterFieldStep = ({
  table,
  fieldRef,
  onChangeField,
  onSubmit,
  onCancel,
  onClose,
}: ParameterFieldStepProps): JSX.Element => {
  const selectedField = getSelectedField(table, fieldRef);

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
      <Select placeholder={t`Pick a column`} onChange={handleChange}>
        {table.fields.map((field, index) => (
          <Option key={index} name={field.displayName()} value={field} />
        ))}
      </Select>
    </ModalContent>
  );
};

const getSelectedField = (table: Table, fieldRef?: unknown[]) => {
  return table.fields.find(field => _.isEqual(field.reference(), fieldRef));
};

const mapStateToProps = (
  state: State,
  { cardId }: ParameterFieldStepOwnProps,
) => ({
  table: Tables.selectors.getObject(state, {
    entityId: getQuestionVirtualTableId({ id: cardId }),
  }),
});

const mapDispatchToProps = {
  onFetchMetadata: Tables.actions.fetchMetadata,
};

export default connect(mapStateToProps, mapDispatchToProps)(ParameterFieldStep);
