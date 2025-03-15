import { t } from "ttag";
import _ from "underscore";

import { FIELD_SEMANTIC_TYPES } from "metabase/lib/core";
import { Select } from "metabase/ui";

const NULL_VALUE = "null";
const DATA = getData();

interface Props {
  className?: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

export const SemanticTypePicker = ({ className, value, onChange }: Props) => {
  const handleChange = (value: string) => {
    const parsedValue = parseValue(value);
    onChange(parsedValue);
  };

  return (
    <Select
      className={className}
      comboboxProps={{
        position: "bottom-start",
        width: 300,
      }}
      data={DATA}
      fw="bold"
      nothingFoundMessage={t`Didn't find any results`}
      placeholder={t`Select a semantic type`}
      searchable
      value={stringifyValue(value)}
      onChange={handleChange}
    />
  );
};

function parseValue(value: string): string | null {
  return value === NULL_VALUE ? null : value;
}

function stringifyValue(value: string | null): string {
  return value === null ? NULL_VALUE : value;
}

function getData() {
  const options = [
    ...FIELD_SEMANTIC_TYPES,
    {
      id: null,
      name: t`No semantic type`,
      section: t`Other`,
      icon: "empty" as const,
    },
  ].map(option => ({
    label: option.name,
    value: stringifyValue(option.id),
    section: option.section,
    icon: option.icon,
  }));

  const data = Object.entries(_.groupBy(options, "section")).map(
    ([group, items]) => ({ group, items }),
  );

  return data;
}
