import { FIELD_SEMANTIC_TYPES } from "metabase/lib/core";
import type Field from "metabase-lib/v1/metadata/Field";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isTypeFK, isTypePK, isa } from "metabase-lib/v1/types/utils/isa";

export function getCompatibleSemanticTypes(
  field: Field,
  currentValue: string | null,
) {
  const effectiveType = field.effective_type ?? field.base_type;
  const isText = isa(effectiveType, TYPE.Text);
  const isTextLike = isa(effectiveType, TYPE.TextLike);
  const levelOneTypes = getLevelOneDataTypes().filter(levelOneType => {
    return isa(effectiveType, levelOneType);
  });

  return FIELD_SEMANTIC_TYPES.filter(option => {
    const isCurrentValue = option.id === currentValue;

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

    if (option.deprecated) {
      return false;
    }

    // "Category" is the semantic type for Booleans
    if (option.id === TYPE.Category && isa(effectiveType, TYPE.Boolean)) {
      return true;
    }

    if (option.id === TYPE.Name) {
      return isText && !isTextLike;
    }

    const isDerivedFromAnyLevelOneType = levelOneTypes.some(type => {
      return isa(option.id, type);
    });

    /**
     * Hack: allow "casting" text types to numerical types
     * @see https://metaboat.slack.com/archives/C08E17FN206/p1741960345351799?thread_ts=1741957848.897889&cid=C08E17FN206
     *
     * If Field’s effective_type is derived from "type/Text" or "type/TextLike",
     * additionally show semantic types derived from "type/Number".
     */
    if (isText || isTextLike) {
      return isDerivedFromAnyLevelOneType || isa(option.id, TYPE.Number);
    }

    // Limit the choice to types derived from level-one data type of Field’s effective_type
    return isDerivedFromAnyLevelOneType;
  });
}

// TODO: https://linear.app/metabase/issue/SEM-184
function getLevelOneDataTypes(): string[] {
  return [
    TYPE.Text,
    TYPE.TextLike,
    TYPE.Number,
    TYPE.Temporal,
    TYPE.Boolean,
    TYPE.Collection,
    TYPE.Structured,
  ];
}
