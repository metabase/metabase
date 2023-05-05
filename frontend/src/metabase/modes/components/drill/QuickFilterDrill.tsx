import React from "react";
import { t } from "ttag";
import { RowValue } from "metabase-types/api";
import {
  quickFilterDrill,
  quickFilterDrillQuestion,
} from "metabase-lib/queries/drills/quick-filter-drill";
import type { ClickActionButtonType, Drill } from "../../types";
import { QuestionChangeClickAction } from "../../types";

const OperatorToButtonTypeMap: Record<string, ClickActionButtonType> = {
  text: "horizontal",
  date: "horizontal",
};

const getOperatorOverrides = ({
  valueType,
  name,
  value,
}: {
  valueType: "null" | "date" | "numeric" | "text";
  name: string;
  value: RowValue | undefined;
}) => {
  if (valueType === "text" && typeof value === "string" && value.length > 0) {
    if (name === "=") {
      return {
        title: t`Is ${value}`,
        icon: <>=</>,
      };
    }
    if (name === "≠") {
      return {
        title: t`Is not ${value}`,
        icon: <>≠</>,
      };
    }
  }

  if (valueType === "date") {
    if (name === "<") {
      return {
        title: t`Before`,
      };
    }
    if (name === ">") {
      return {
        title: t`After`,
      };
    }
    if (name === "=") {
      return {
        title: t`On`,
      };
    }
    if (name === "≠") {
      return {
        title: t`Not on`,
      };
    }
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
    buttonType: OperatorToButtonTypeMap[valueType] || "token-filter",
    question: () => quickFilterDrillQuestion({ question, clicked, filter }),
    extra: () => ({
      valueType,
    }),
    ...getOperatorOverrides({ valueType, name, value }),
  }));
};

export default QuickFilterDrill;
