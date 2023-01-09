import React, { ChangeEvent, useCallback, useEffect, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Button from "metabase/core/components/Button";
import Radio from "metabase/core/components/Radio";
import Select, {
  Option,
  SelectChangeEvent,
} from "metabase/core/components/Select";
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
  ModalHelpMessage,
  ModalLabel,
  ModalBody,
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
  fieldsValues: string[][][];
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
  fieldsValues,
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
  const fieldValues = useMemo(() => {
    return getFieldValues(fieldsValues);
  }, [fieldsValues]);

  const handleTypeChange = useCallback(
    (sourceType: ValuesSourceType) => {
      onChangeSourceType(sourceType);
      onChangeSourceConfig(getDefaultSourceConfig(sourceType, fieldValues));
    },
    [fieldValues, onChangeSourceType, onChangeSourceConfig],
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
      {sourceType === null ? (
        <FieldSourceModal
          sourceType={sourceType}
          fieldValues={fieldValues}
          onChangeSourceType={handleTypeChange}
        />
      ) : sourceType === "card" ? (
        <CardSourceModal
          table={table}
          sourceType={sourceType}
          sourceConfig={sourceConfig}
          onChangeCard={onChangeCard}
          onChangeSourceType={handleTypeChange}
          onChangeSourceConfig={onChangeSourceConfig}
        />
      ) : sourceType === "static-list" ? (
        <ListSourceModal
          sourceType={sourceType}
          sourceConfig={sourceConfig}
          fieldValues={fieldValues}
          onChangeSourceType={handleTypeChange}
          onChangeSourceConfig={onChangeSourceConfig}
        />
      ) : null}
    </ModalContent>
  );
};

interface FieldSourceModalProps {
  fieldValues: string[];
  sourceType: ValuesSourceType;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
}

const FieldSourceModal = ({
  sourceType,
  fieldValues,
  onChangeSourceType,
}: FieldSourceModalProps) => {
  return (
    <ModalBody>
      <ModalPane>
        <ModalSection>
          <ModalLabel>{t`Where values should come from`}</ModalLabel>
          <Radio
            value={sourceType}
            options={SOURCE_TYPE_OPTIONS}
            vertical
            onChange={onChangeSourceType}
          />
        </ModalSection>
      </ModalPane>
      <ModalMain>
        <ModalTextArea
          defaultValue={getValuesText(fieldValues)}
          readOnly
          fullWidth
        />
      </ModalMain>
    </ModalBody>
  );
};

interface CardSourceModalProps {
  table: Table | undefined;
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  onChangeCard: () => void;
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
}

const CardSourceModal = ({
  table,
  sourceType,
  sourceConfig,
  onChangeCard,
  onChangeSourceType,
  onChangeSourceConfig,
}: CardSourceModalProps) => {
  const fields = useMemo(() => {
    return table ? getSupportedFields(table) : [];
  }, [table]);

  const selectedField = useMemo(() => {
    return getFieldByReference(fields, sourceConfig.value_field);
  }, [fields, sourceConfig]);

  const handleFieldChange = useCallback(
    (event: SelectChangeEvent<Field>) => {
      onChangeSourceConfig({
        ...sourceConfig,
        value_field: event.target.value.reference(),
      });
    },
    [sourceConfig, onChangeSourceConfig],
  );

  return (
    <ModalBody>
      <ModalPane>
        <ModalSection>
          <ModalLabel>{t`Where values should come from`}</ModalLabel>
          <Radio
            value={sourceType}
            options={SOURCE_TYPE_OPTIONS}
            vertical
            onChange={onChangeSourceType}
          />
        </ModalSection>
        <ModalSection>
          <ModalLabel>{t`Model or question to supply the values`}</ModalLabel>
          <SelectButton onClick={onChangeCard}>
            {table ? table.displayName() : t`Pick a model or question…`}
          </SelectButton>
        </ModalSection>
        {table && (
          <ModalSection>
            <ModalLabel>{t`Column to supply the values`}</ModalLabel>
            <Select
              value={selectedField}
              placeholder={t`Pick a column…`}
              onChange={handleFieldChange}
            >
              {fields.map((field, index) => (
                <Option key={index} name={field.displayName()} value={field} />
              ))}
            </Select>
          </ModalSection>
        )}
      </ModalPane>
      <ModalMain>
        <ModalTextArea readOnly fullWidth />
      </ModalMain>
    </ModalBody>
  );
};

interface ListSourceModalProps {
  sourceType: ValuesSourceType;
  sourceConfig: ValuesSourceConfig;
  fieldValues: string[];
  onChangeSourceType: (sourceType: ValuesSourceType) => void;
  onChangeSourceConfig: (sourceConfig: ValuesSourceConfig) => void;
}

const ListSourceModal = ({
  sourceType,
  sourceConfig,
  onChangeSourceType,
  onChangeSourceConfig,
}: ListSourceModalProps) => {
  const handleValuesChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChangeSourceConfig({ values: getStaticValues(event.target.value) });
    },
    [onChangeSourceConfig],
  );

  return (
    <ModalBody>
      <ModalPane>
        <ModalSection>
          <ModalLabel>{t`Where values should come from`}</ModalLabel>
          <Radio
            value={sourceType}
            options={SOURCE_TYPE_OPTIONS}
            vertical
            onChange={onChangeSourceType}
          />
          <ModalHelpMessage>{t`Enter one value per line.`}</ModalHelpMessage>
        </ModalSection>
      </ModalPane>
      <ModalMain>
        <ModalTextArea
          defaultValue={getValuesText(sourceConfig.values)}
          fullWidth
          onChange={handleValuesChange}
        />
      </ModalMain>
    </ModalBody>
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

const getFieldByReference = (fields: Field[], fieldReference?: unknown[]) => {
  return fields.find(field => _.isEqual(field.reference(), fieldReference));
};

const getSupportedFields = (table: Table) => {
  return table.fields.filter(field => field.isString());
};

const mapStateToProps = (
  state: State,
  { fields }: ModalOwnProps,
): ModalStateProps => {
  return {
    fieldsValues: fields.map(field =>
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
