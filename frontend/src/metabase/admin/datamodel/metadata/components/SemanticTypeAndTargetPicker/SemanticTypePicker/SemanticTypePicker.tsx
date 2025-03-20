import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  DEPRECATED_FIELD_SEMANTIC_TYPES,
  FIELD_SEMANTIC_TYPES,
} from "metabase/lib/core";
import { Select } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isTypeFK, isTypePK, isa } from "metabase-lib/v1/types/utils/isa";

const NO_SEMANTIC_TYPE = null;
const NO_SEMANTIC_TYPE_STRING = "null";

interface Props {
  className?: string;
  field: Field;
  value: string | null;
  onChange: (value: string | null) => void;
}

export const SemanticTypePicker = ({
  className,
  field,
  value,
  onChange,
}: Props) => {
  const data = useMemo(() => getData({ field, value }), [field, value]);

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

function getData({ field, value }: Pick<Props, "field" | "value">) {
  const effectiveType = field.effective_type ?? field.base_type;
  const levelOneType = getLevelOneTypes().find(levelOneType => {
    return isa(effectiveType, levelOneType);
  });

  const options = FIELD_SEMANTIC_TYPES.filter(option => {
    const isCurrentValue = option.id === value;

    if (
      // This accounts for cases where user set an incompatible option before
      // we started to filter out incompatible options from the list.
      isCurrentValue ||
      // Allow any type to be a PK
      isTypePK(option.id) ||
      // Allow any type to be a FK
      isTypeFK(option.id)
    ) {
      return true;
    }

    if (isDeprecated(option.id)) {
      return false;
    }

    // "Category" is the semantic type for Booleans
    if (option.id === TYPE.Category && isa(effectiveType, TYPE.Boolean)) {
      return true;
    }

    if (option.id === TYPE.Name) {
      const isText = isa(effectiveType, TYPE.Text);
      const isTextLike = isa(effectiveType, TYPE.TextLike);
      return isText && !isTextLike;
    }

    if (!levelOneType) {
      // Sanity check, this should never happen. But if it does, better not to hide the option.
      return true;
    }

    /**
     * Hack: allow "casting" text types to numerical types
     * @see https://metaboat.slack.com/archives/C08E17FN206/p1741960345351799?thread_ts=1741957848.897889&cid=C08E17FN206
     * @see https://www.notion.so/metabase/Fields-f5999d551119498a8ffbc7e8887eebfc
     *
     * If Field’s effective_type is derived from "type/Text" or "type/TextLike",
     * additionally show semantic types derived from "type/Number".
     */
    if (isa(effectiveType, TYPE.Text) || isa(effectiveType, TYPE.TextLike)) {
      return isa(option.id, levelOneType) || isa(option.id, TYPE.Number);
    }

    // Limit the choice to types derived from level-one data type of Field’s effective_type
    return isa(option.id, levelOneType);
  })
    .map(option => ({
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

function getLevelOneTypes(): string[] {
  return [
    TYPE.Number,
    TYPE.Temporal,
    TYPE.Boolean,
    TYPE.Text,
    TYPE.TextLike,
    TYPE.Collection,
    TYPE.Structured,
  ];
}

function isDeprecated(semanticType: string) {
  return DEPRECATED_FIELD_SEMANTIC_TYPES.includes(semanticType);
}
