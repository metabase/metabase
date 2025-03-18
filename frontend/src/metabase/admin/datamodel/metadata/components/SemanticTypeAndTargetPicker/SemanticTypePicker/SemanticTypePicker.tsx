import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  DEPRECATED_FIELD_SEMANTIC_TYPES,
  FIELD_SEMANTIC_TYPES,
} from "metabase/lib/core";
import { Select } from "metabase/ui";
import type { Field } from "metabase-types/api";

const NULL_VALUE = "null";

interface Props {
  baseType: Field["base_type"];
  className?: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

export const SemanticTypePicker = ({
  baseType,
  className,
  value,
  onChange,
}: Props) => {
  const data = useMemo(() => getData({ baseType, value }), [baseType, value]);

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
      data={data}
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

function getData({ baseType, value }: Pick<Props, "baseType" | "value">) {
  const options = [
    ...FIELD_SEMANTIC_TYPES,
    {
      id: null,
      name: t`No semantic type`,
      section: t`Other`,
      icon: "empty" as const,
    },
  ]
    .filter(option => {
      if (option.id === null) {
        return true;
      }
      const isDeprecated = DEPRECATED_FIELD_SEMANTIC_TYPES.includes(option.id);
      const isCurrentValue = option.id === value;
      return !isDeprecated || isCurrentValue;
    })
    .map(option => ({
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
