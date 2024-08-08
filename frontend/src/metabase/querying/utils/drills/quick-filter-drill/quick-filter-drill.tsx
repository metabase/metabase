import { t } from "ttag";

import type {
  ClickAction,
  Drill,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { getFilterPopover } from "../filter-drill";

export const quickFilterDrill: Drill<Lib.QuickFilterDrillThruInfo> = ({
  question,
  drill,
  drillInfo,
  applyDrill,
}) => {
  const { value, operators } = drillInfo;
  const { query, stageIndex, column } = Lib.filterDrillDetails(drill);

  return operators.map(operator => ({
    name: `quick-filter.${operator}`,
    title: operator,
    section: "filter",
    sectionDirection: "row",
    buttonType: "token-filter",
    question: () => applyDrill(drill, operator),
    ...getActionOverrides(question, query, stageIndex, column, operator, value),
  }));
};

function getActionOverrides(
  question: Question,
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  operator: Lib.QuickFilterDrillThruOperator,
  value: unknown,
): Partial<ClickAction> {
  if (Lib.isTemporal(column) && value != null) {
    const action: Partial<ClickAction> = {
      sectionTitle: t`Filter by this date`,
      sectionDirection: "column",
      buttonType: "horizontal",
    };

    switch (operator) {
      case "=":
        return { ...action, title: t`On` };
      case "≠":
        return { ...action, title: t`Not on` };
      case ">":
        return { ...action, title: t`After` };
      case "<":
        return { ...action, title: t`Before` };
      default:
        return action;
    }
  }

  if (Lib.isStringOrStringLike(column) && typeof value === "string") {
    const columnName = Lib.displayInfo(query, stageIndex, column).displayName;
    const valueTitle = getTextValueTitle(value);
    const action: Partial<ClickAction> = {
      sectionTitle: t`Filter by ${columnName}`,
      sectionDirection: "column",
      buttonType: "horizontal",
    };

    switch (operator) {
      case "=":
        return {
          ...action,
          title: t`Is ${valueTitle}`,
          iconText: operator,
        };
      case "≠":
        return {
          ...action,
          title: t`Is not ${valueTitle}`,
          iconText: operator,
        };
      case "contains": {
        return {
          ...action,
          title: t`Contains…`,
          popover: getFilterPopover({ question, query, stageIndex, column }),
        };
      }
      case "does-not-contain": {
        return {
          ...action,
          title: t`Does not contain…`,
          popover: getFilterPopover({ question, query, stageIndex, column }),
        };
      }
      default: {
        return action;
      }
    }
  }

  return {};
}

const LONG_TEXT_VALUE_LENGTH = 20;

const getTextValueTitle = (value: string): string => {
  if (value.length === 0) {
    return t`empty`;
  }

  if (value.length > LONG_TEXT_VALUE_LENGTH) {
    return t`this`;
  }

  return value;
};
