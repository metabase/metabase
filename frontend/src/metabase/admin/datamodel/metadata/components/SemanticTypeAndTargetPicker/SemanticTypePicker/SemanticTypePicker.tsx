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
  const levelOneTypes = getLevelOneTypes().filter(levelOneType => {
    return isa(effectiveType, levelOneType);
  });

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

      if (
        isNoSemanticType ||
        isCurrentValue ||
        isTypePK(option.id) ||
        isTypeFK(option.id)
      ) {
        return true;
      }

      const isDeprecated = DEPRECATED_FIELD_SEMANTIC_TYPES.includes(option.id);

      if (isDeprecated) {
        return false;
      }

      if (isa(effectiveType, TYPE.Boolean) && option.id === TYPE.Category) {
        // "Category" is the semantic type for Booleans
        return true;
      }

      if (option.id === TYPE.Name) {
        const isText = isa(effectiveType, TYPE.Text);
        const isTextLike = isa(effectiveType, TYPE.TextLike);
        return isText && !isTextLike;
      }

      const isDerivedFromLevelOneType = levelOneTypes.some(type => {
        return isa(option.id, type);
      });

      /**
       * Hack: allow "casting" text types to numerical types
       * @see https://metaboat.slack.com/archives/C08E17FN206/p1741960345351799?thread_ts=1741957848.897889&cid=C08E17FN206
       * @see https://www.notion.so/metabase/Fields-f5999d551119498a8ffbc7e8887eebfc
       *
       * If Field’s effective_type is derived from "type/Text" or "type/TextLike",
       * additionally show semantic types derived from "type/Number".
       */
      if (isa(effectiveType, TYPE.Text) || isa(effectiveType, TYPE.TextLike)) {
        return isDerivedFromLevelOneType || isa(option.id, TYPE.Number);
      }

      return isDerivedFromLevelOneType;
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
