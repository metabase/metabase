import type * as React from "react";
import { t } from "ttag";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import type {
  ClickActionButtonType,
  Drill,
} from "metabase/visualizations/types/click-actions";
import type * as Lib from "metabase-lib";
import { isBoolean, isDate, isNumeric } from "metabase-lib/types/utils/isa";
import { TextIcon } from "../QuickFilterDrill/QuickFilterDrill.styled";

type FilterOperator = "=" | "≠" | "<" | ">" | "contains" | "does-not-contain";
type FilterValueType = "null" | "numeric" | "date" | "boolean" | "text";

const DateButtonTitleMap: Record<string, string> = {
  ["<"]: t`Before`,
  [">"]: t`After`,
  ["="]: t`On`,
  ["≠"]: t`Not on`,
};

const SPECIFIC_VALUE_TITLE_MAX_LENGTH = 20;

const getTextValueTitle = (value: string): string => {
  if (value.length === 0) {
    return t`empty`;
  }

  if (value.length > SPECIFIC_VALUE_TITLE_MAX_LENGTH) {
    return t`this`;
  }

  return value;
};

const getOperatorOverrides = (
  operator: FilterOperator,
  valueType: FilterValueType,
  value: RowValue | undefined,
): {
  title?: string;
  icon?: React.ReactNode;
  buttonType?: ClickActionButtonType;
} | null => {
  if (valueType === "text" && typeof value === "string") {
    const textValue = getTextValueTitle(value);

    if (operator === "=") {
      return {
        title: t`Is ${textValue}`,
        icon: <TextIcon>=</TextIcon>,
        buttonType: "horizontal",
      };
    }
    if (operator === "≠") {
      return {
        title: t`Is not ${textValue}`,
        icon: <TextIcon>≠</TextIcon>,
        buttonType: "horizontal",
      };
    }
    // if (operator === "contains") {
    //   return {
    //     title: t`Contains…`,
    //     icon: "filter",
    //     buttonType: "horizontal",
    //   };
    // }
    // if (operator === "does-not-contain") {
    //   return {
    //     title: t`Does not contain…`,
    //     icon: <TextIcon>≠</TextIcon>,
    //     buttonType: "horizontal",
    //   };
    // }
  }

  if (valueType === "date") {
    return {
      title: DateButtonTitleMap[operator],
      buttonType: "horizontal",
    };
  }

  return null;
};

export const QuickFilterDrill: Drill<Lib.QuickFilterDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  applyDrill,
  clicked,
}) => {
  if (!drill || !clicked || !clicked.column) {
    return [];
  }

  const { operators } = drillDisplayInfo;
  const { value, column } = clicked;

  const columnValueType = getValueType(value, column);

  return operators.map(operator => {
    const overrides = getOperatorOverrides(operator, columnValueType, value);

    return {
      name: operator,
      title: operator,
      section: "filter",
      buttonType: "token-filter",

      question: () => applyDrill(drill, operator),

      extra: () => ({
        valueType: columnValueType,
        columnName: clicked.column?.display_name,
      }),

      ...overrides,
    };
  });
};

const getValueType = (
  value: unknown,
  column: DatasetColumn,
): FilterValueType => {
  if (value == null) {
    return "null";
  }

  if (isNumeric(column)) {
    return "numeric";
  }

  if (isDate(column)) {
    return "date";
  }

  if (isBoolean(column)) {
    return "boolean";
  }

  return "text";
};
