import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Select, type SelectProps } from "metabase/ui";
import type { Field } from "metabase-types/api";

import { getCompatibleSemanticTypes } from "./utils";

const NO_SEMANTIC_TYPE = null;
const NO_SEMANTIC_TYPE_STRING = "null";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  field: Field;
  value: string | null;
  onChange: (value: string | null) => void;
}

export const SemanticTypePicker = ({
  field,
  value,
  onChange,
  ...props
}: Props) => {
  const data = useMemo(() => getData({ field, value }), [field, value]);

  const handleChange = (value: string) => {
    const parsedValue = parseValue(value);
    onChange(parsedValue);
  };

  return (
    <Select
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
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
      {...props}
    />
  );
};

function parseValue(value: string): string | null {
  return value === NO_SEMANTIC_TYPE_STRING ? NO_SEMANTIC_TYPE : value;
}

function stringifyValue(value: string | null): string {
  return value === NO_SEMANTIC_TYPE ? NO_SEMANTIC_TYPE_STRING : value;
}

function getData({ field, value }: Pick<Props, "field" | "value">) {
  const options = getCompatibleSemanticTypes(field, value)
    .map((option) => ({
      label: option.name,
      value: stringifyValue(option.id),
      section: option.section,
      icon: option.icon,
    }))
    .concat([
      {
        label: t`No semantic type`,
        value: stringifyValue(NO_SEMANTIC_TYPE),
        section: t`Other`,
        icon: "empty" as const,
      },
    ]);

  const data = Object.entries(_.groupBy(options, "section")).map(
    ([group, items]) => ({ group, items }),
  );

  return data;
}
