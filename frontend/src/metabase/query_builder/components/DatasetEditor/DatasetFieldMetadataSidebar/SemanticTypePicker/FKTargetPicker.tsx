import { useField } from "formik";
import { useEffect, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Select from "metabase/core/components/Select";
import Databases from "metabase/entities/databases";
import type Field from "metabase-lib/v1/metadata/Field";
import type { DatabaseId } from "metabase-types/api";

type FieldObject = {
  id: number;
  display_name: string;
  fk_target_field_id?: number;
  table: {
    display_name: string;
  };
};

type StateProps = {
  IDFields: Field[];
  fetchDatabaseIDFields: (payload: { id: number }) => Promise<void>;
};

type OwnProps = {
  name: "string";
  databaseId: DatabaseId;
  onChange?: (value: string) => void;
};

type Props = OwnProps & StateProps;

function getOptionValue(option: FieldObject) {
  return option.id;
}

function getOptionIcon() {
  return null;
}

function getFieldName(field: Field) {
  return field.displayName({ includeTable: true });
}

const SEARCH_PROPERTIES = [
  "display_name",
  "table.display_name",
  "table.schema_name",
];

function mapStateToProps(
  state: Record<string, unknown>,
  { databaseId }: OwnProps,
) {
  return {
    IDFields: Databases.selectors.getIdFields(state, { databaseId }),
  };
}

const mapDispatchToProps = {
  fetchDatabaseIDFields: Databases.objectActions.fetchIdFields,
};

function FKTargetPicker({
  name,
  databaseId,
  IDFields,
  fetchDatabaseIDFields,
  onChange,
}: Props) {
  const [{ value }, __, { setValue }] = useField(name);

  useEffect(() => {
    fetchDatabaseIDFields({ id: databaseId });
  }, [databaseId, fetchDatabaseIDFields]);

  const options = useMemo(
    () => _.sortBy(IDFields, field => getFieldName(field)),
    [IDFields],
  );

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setValue(e.target.value);
    onChange?.(e.target.value);
  };

  return (
    <Select
      placeholder={t`Select a target`}
      value={value}
      options={options}
      onChange={handleChange}
      searchable
      searchProp={SEARCH_PROPERTIES}
      buttonProps={{
        "aria-label": t`Foreign key target`,
      }}
      optionValueFn={getOptionValue}
      optionNameFn={getFieldName}
      optionIconFn={getOptionIcon}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(FKTargetPicker);
