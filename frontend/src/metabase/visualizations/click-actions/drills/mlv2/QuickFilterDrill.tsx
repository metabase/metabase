import { t } from "ttag";
import type {
  ClickAction,
  Drill,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";
import { getFilterPopover } from "./utils";

export const QuickFilterDrill: Drill<Lib.QuickFilterDrillThruInfo> = ({
  question,
  drill,
  drillDisplayInfo,
  applyDrill,
}) => {
  const { operators } = drillDisplayInfo;
  const drillInfo = Lib.quickFilterDrillDetails(drill);

  return operators.map(operator => ({
    name: operator,
    title: operator,
    section: "filter",
    sectionDirection: "row",
    buttonType: "token-filter",
    question: () => applyDrill(drill, operator),
    ...getActionOverrides(question, drill, drillInfo, operator),
  }));
};

function getActionOverrides(
  question: Question,
  drill: Lib.DrillThru,
  { query, column, stageIndex, value }: Lib.QuickFilterDrillThruDetails,
  operator: Lib.QuickFilterDrillThruOperator,
): Partial<ClickAction> {
  if (Lib.isDate(column) && value != null) {
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

  if (Lib.isString(column) && typeof value === "string") {
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
          title: `Contains…`,
          popover: getFilterPopover({ question, query, column }),
        };
      }
      case "does-not-contain": {
        return {
          ...action,
          title: `Does not contain…`,
          popover: getFilterPopover({ question, query, column }),
        };
      }
      default: {
        return action;
      }
    }
  }

  return {};
}

const getTextValueTitle = (value: string): string => {
  if (value.length === 0) {
    return t`empty`;
  }

  if (value.length > 20) {
    return t`this`;
  }

  return value;
};
