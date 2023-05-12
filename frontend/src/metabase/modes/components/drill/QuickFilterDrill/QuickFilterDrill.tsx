import React from "react";
import { t } from "ttag";
import { RowValue } from "metabase-types/api";
import {
  QuickFilterDataValueType,
  quickFilterDrill,
  quickFilterDrillQuestion,
  QuickFilterOperatorType,
} from "metabase-lib/queries/drills/quick-filter-drill";
import type {
  ClickActionButtonType,
  Drill,
  QuestionChangeClickAction,
} from "../../../types";
import { TextIcon } from "./QuickFilterDrill.styled";

const DateButtonTitleMap: Record<QuickFilterOperatorType, string> = {
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
  }

  if (valueType === "date") {
    return {
      title: DateButtonTitleMap[name],
      buttonType: "horizontal",
    };
  }

  return null;
};

const QuickFilterDrill: Drill = ({
  question,
  clicked,
}): QuestionChangeClickAction[] => {
  const drill = quickFilterDrill({ question, clicked });
  if (!drill || !clicked) {
    return [];
  }

  const { value } = clicked;
  const { operators, valueType } = drill;

  return operators.map(({ name, filter }) => ({
    name,
    title: name,
    section: "filter",
    buttonType: "token-filter",
    question: () => quickFilterDrillQuestion({ question, clicked, filter }),
    extra: () => ({
      valueType,
    }),
    ...getOperatorOverrides({ valueType, name, value }),
  }));
};

export default QuickFilterDrill;
