import React from "react";
import { t } from "ttag";
import { RowValue } from "metabase-types/api";
import type {
  ClickActionButtonType,
  ClickActionProps,
  PopoverClickAction,
  QuestionChangeClickAction,
} from "metabase/modes/types";
import {
  quickFilterDrill,
  QuickFilterDrillOperator,
  quickFilterDrillQuestion,
  QuickFilterOperatorType,
} from "metabase-lib/queries/drills/quick-filter-drill";
import Filter from "metabase-lib/queries/structured/Filter";
import { getColumnFilterDrillPopover } from "../common/ColumnFilterDrillPopover";
import { TextIcon } from "./QuickFilterDrill.styled";

export type DateQuickFilterOperatorType = "<" | ">" | "=" | "≠";

const DateButtonTitleMap: Record<DateQuickFilterOperatorType, string> = {
  ["<"]: t`Before`,
  [">"]: t`After`,
  ["="]: t`On`,
  ["≠"]: t`Not on`,
};

const SPECIFIC_VALUE_TITLE_MAX_LENGTH = 20;

const CUSTOM_BEHAVIOR_OPERATORS: QuickFilterOperatorType[] = [
  "contains",
  "does-not-contain",
];

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
  { name, valueType }: QuickFilterDrillOperator,
  value: RowValue | undefined,
): {
  title?: string;
  icon?: React.ReactNode;
  buttonType?: ClickActionButtonType;
} | null => {
  if (valueType === "text" && typeof value === "string") {
    const textValue = getTextValueTitle(value);

    if (name === "=") {
      return {
        title: t`Is ${textValue}`,
        icon: <TextIcon>=</TextIcon>,
        buttonType: "horizontal",
      };
    }
    if (name === "≠") {
      return {
        title: t`Is not ${textValue}`,
        icon: <TextIcon>≠</TextIcon>,
        buttonType: "horizontal",
      };
    }
    if (name === "contains") {
      return {
        title: t`Contains…`,
        icon: "filter",
        buttonType: "horizontal",
      };
    }
    if (name === "does-not-contain") {
      return {
        title: t`Does not contain…`,
        icon: <TextIcon>≠</TextIcon>,
        buttonType: "horizontal",
      };
    }
  }

  if (valueType === "date") {
    return {
      title: DateButtonTitleMap[name],
      buttonType: "horizontal",
    };
  }

  return null;
};

const QuickFilterDrill = ({
  question,
  clicked,
}: ClickActionProps): Array<QuestionChangeClickAction | PopoverClickAction> => {
  const drill = quickFilterDrill({ question, clicked });
  if (!drill || !drill.operators || !clicked) {
    return [];
  }

  const { value } = clicked;
  const { query, operators } = drill;

  return operators.map(operator => {
    const { name, filter, valueType } = operator;

    if (CUSTOM_BEHAVIOR_OPERATORS.includes(name)) {
      return {
        name,
        title: name,
        section: "filter",
        buttonType: "token-filter",
        popover: getColumnFilterDrillPopover({
          query,
          initialFilter: new Filter(filter, 0, query),
        }),
        ...getOperatorOverrides(operator, value),
      };
    }

    return {
      name,
      title: name,
      section: "filter",
      buttonType: "token-filter",
      question: () => quickFilterDrillQuestion({ question, clicked, filter }),
      extra: () => ({
        valueType,
      }),
      ...getOperatorOverrides(operator, value),
    };
  });
};

export default QuickFilterDrill;
