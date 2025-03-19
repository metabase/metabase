import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  DEPRECATED_FIELD_SEMANTIC_TYPES,
  FIELD_SEMANTIC_TYPES,
} from "metabase/lib/core";
import { Select } from "metabase/ui";
import { isa } from "metabase-lib/v1/types/utils/isa";
import type { Field } from "metabase-types/api";

const NO_SEMANTIC_TYPE = null;
const NO_SEMANTIC_TYPE_STRING = "null";

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
  return value === NO_SEMANTIC_TYPE_STRING ? NO_SEMANTIC_TYPE : value;
}

function stringifyValue(value: string | null): string {
  return value === NO_SEMANTIC_TYPE ? NO_SEMANTIC_TYPE_STRING : value;
}

function getData({ baseType, value }: Pick<Props, "baseType" | "value">) {
  const options = [
    ...FIELD_SEMANTIC_TYPES,
    {
      id: NO_SEMANTIC_TYPE,
      name: t`No semantic type`,
      section: t`Other`,
      icon: "empty" as const,
    },
  ]
    .filter(option => {
      const isCurrentValue = option.id === value;
      const isNoSemanticType = option.id === NO_SEMANTIC_TYPE;

      if (isNoSemanticType || isCurrentValue) {
        return true;
      }

      const isDeprecated = DEPRECATED_FIELD_SEMANTIC_TYPES.includes(option.id);

      if (isDeprecated) {
        return false;
      }

      return isa(option.id, baseType);
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
