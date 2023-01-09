import React, { ChangeEvent, useCallback, useEffect, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button/Button";
import Radio from "metabase/core/components/Radio/Radio";
import SelectButton from "metabase/core/components/SelectButton";
import ModalContent from "metabase/components/ModalContent";
import Fields from "metabase/entities/fields";
import Tables from "metabase/entities/tables";
import { ValuesSourceConfig, ValuesSourceType } from "metabase-types/api";
import { Dispatch, State } from "metabase-types/store";
import Field from "metabase-lib/metadata/Field";
import Table from "metabase-lib/metadata/Table";
import { getQuestionVirtualTableId } from "metabase-lib/metadata/utils/saved-questions";
import {
  getDefaultSourceConfig,
  isValidSourceConfig,
} from "metabase-lib/parameters/utils/parameter-source";
import {
  ModalHelpText,
  ModalLabel,
  ModalLayout,
  ModalMain,
  ModalPane,
  ModalSection,
  ModalTextArea,
} from "./ValuesSourceTypeModal.styled";

const NEW_LINE = "\n";

const SOURCE_TYPE_OPTIONS = [
  { name: t`From this field`, value: null },
  { name: t`From another model or question`, value: "card" },
  { name: t`Custom list`, value: "static-list" },
];

interface ModalOwnProps {
  name: string;
  fields: Field[];
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
  onChangeCard: () => void;
  onSubmit: () => void;
  onClose: () => void;
}

interface ModalTableProps {
  table?: Table;
}

interface ModalStateProps {
  fieldValues: string[][][];
}

interface ModalDispatchProps {
  onFetchFields: (fields: Field[]) => void;
}

type ModalProps = ModalOwnProps &
  ModalTableProps &
  ModalStateProps &
  ModalDispatchProps;

const ValuesSourceTypeModal = ({
  name,
  fields,
  fieldValues,
  table,
  sourceType,
  sourceConfig,
  onFetchFields,
  onChangeSourceType,
  onChangeSourceConfig,
  onChangeCard,
  onSubmit,
  onClose,
}: ModalProps): JSX.Element => {
  const uniqueValues = useMemo(() => {
    return getFieldValues(fieldValues);
  }, [fieldValues]);

  const handleTypeChange = useCallback(
    (sourceType: ValuesSourceType) => {
      onChangeSourceType(sourceType);
      onChangeSourceConfig(getDefaultSourceConfig(sourceType, uniqueValues));
    },
    [uniqueValues, onChangeSourceType, onChangeSourceConfig],
  );

  const handleValuesChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChangeSourceConfig({ values: getStaticValues(event.target.value) });
    },
    [onChangeSourceConfig],
  );

  useEffect(() => {
    onFetchFields(fields);
  }, [fields, onFetchFields]);

  return (
    <ModalContent
      title={t`Selectable values for ${name}`}
      footer={[
        <Button
          key="submit"
          primary
          disabled={!isValidSourceConfig(sourceType, sourceConfig)}
          onClick={onSubmit}
        >{t`Done`}</Button>,
      ]}
      onClose={onClose}
    >
      <ModalLayout>
        <ModalPane>
          <ModalSection>
            <ModalLabel>{t`Where values should come from`}</ModalLabel>
            <Radio
              value={sourceType}
              options={SOURCE_TYPE_OPTIONS}
              vertical
              onChange={handleTypeChange}
            />
            {sourceType === "static-list" && (
              <ModalHelpText>{t`Enter one value per line.`}</ModalHelpText>
            )}
          </ModalSection>
          {sourceType === "card" && (
            <ModalSection>
              <ModalLabel>{t`Model or question to supply the values`}</ModalLabel>
              <SelectButton onClick={onChangeCard}>
                {table ? table.displayName() : t`Pick a model or question…`}
              </SelectButton>
            </ModalSection>
          )}
        </ModalPane>
        <ModalMain>
          {sourceType === null && (
            <ModalTextArea
              defaultValue={getValuesText(uniqueValues)}
              readOnly
              fullWidth
            />
          )}
          {sourceType === "static-list" && (
            <ModalTextArea
              defaultValue={getValuesText(sourceConfig.values)}
              fullWidth
              onChange={handleValuesChange}
            />
          )}
        </ModalMain>
      </ModalLayout>
    </ModalContent>
  );
};

const getValuesText = (values?: string[]) => {
  return values?.join(NEW_LINE) ?? "";
};

const getFieldValues = (fieldsValues: string[][][]) => {
  const allValues = fieldsValues.flatMap(values => values.map(([key]) => key));
  return Array.from(new Set(allValues));
};

const getStaticValues = (value: string) => {
  return value
    .split(NEW_LINE)
    .map(line => line.trim())
    .filter(line => line.length > 0);
};

const mapStateToProps = (
  state: State,
  { fields }: ModalOwnProps,
): ModalStateProps => {
  return {
    fieldValues: fields.map(field =>
      Fields.selectors.getFieldValues(state, { entityId: field.id }),
    ),
  };
};

const mapDispatchToProps = (dispatch: Dispatch): ModalDispatchProps => {
  return {
    onFetchFields: (fields: Field[]) => {
      fields.forEach(field =>
        dispatch(Fields.actions.fetchFieldValues({ id: field.id })),
      );
    },
  };
};

export default _.compose(
  Tables.load({
    id: (state: State, { sourceConfig: { card_id } }: ModalOwnProps) =>
      card_id ? getQuestionVirtualTableId(card_id) : undefined,
    requestType: "fetchMetadata",
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(ValuesSourceTypeModal);
