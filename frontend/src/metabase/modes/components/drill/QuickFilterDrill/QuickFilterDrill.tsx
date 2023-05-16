import React from "react";
import { t } from "ttag";
import { RowValue } from "metabase-types/api";
import type {
  ClickActionButtonType,
  ClickActionProps,
  QuestionChangeClickAction,
} from "metabase/modes/types";
import { getColumnFilterDrillPopover } from "metabase/modes/components/drill/common/ColumnFilterDrillPopover";
import { PopoverClickAction } from "metabase/modes/types";
import {
  QuickFilterDataValueType,
  quickFilterDrill,
  quickFilterDrillQuestion,
  QuickFilterOperatorType,
} from "metabase-lib/queries/drills/quick-filter-drill";
import Filter from "metabase-lib/queries/structured/Filter";
import { TextIcon } from "./QuickFilterDrill.styled";

const DateButtonTitleMap: Record<QuickFilterOperatorType, string> = {
  ["<"]: t`Before`,
  [">"]: t`After`,
  ["="]: t`On`,
  ["≠"]: t`Not on`,

  ["contains"]: "",
  ["does-not-contain"]: "",
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

const getOperatorOverrides = ({
  valueType,
  name,
  value,
}: {
  valueType: QuickFilterDataValueType;
  name: QuickFilterOperatorType;
  value: RowValue | undefined;
}): {
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
  const {
    query,
    operators: { operators, valueType },
  } = drill;

  return operators.map(({ name, filter }) => {
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
        ...getOperatorOverrides({ valueType, name, value }),
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
      ...getOperatorOverrides({ valueType, name, value }),
    };
  });
};

export default QuickFilterDrill;
