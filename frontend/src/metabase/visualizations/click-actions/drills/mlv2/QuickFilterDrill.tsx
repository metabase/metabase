import { t } from "ttag";
import type {
  ClickAction,
  Drill,
} from "metabase/visualizations/types/click-actions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/Question";

export const QuickFilterDrill: Drill<Lib.QuickFilterDrillThruInfo> = ({
  drill,
  drillDisplayInfo,
  applyDrill,
}) => {
  if (!drill) {
    return [];
  }

  const { operators } = drillDisplayInfo;
  const drillDetails = Lib.quickFilterDrillDetails(drill);

  return operators.map(operator =>
    getClickAction(drill, drillDetails, operator, applyDrill),
  );
};

const getTextValueTitle = (value: string): string => {
  if (value.length === 0) {
    return t`empty`;
  }

  if (value.length > 20) {
    return t`this`;
  }

  return value;
};

function getClickAction(
  drill: Lib.DrillThru,
  { query, column, value }: Lib.QuickFilterDrillThruDetails,
  operator: Lib.QuickFilterDrillThruOperator,
  applyDrill: (
    drill: Lib.DrillThru,
    operator: Lib.QuickFilterDrillThruOperator,
  ) => Question,
): ClickAction {
  const action: ClickAction = {
    name: operator,
    title: operator,
    section: "filter",
    sectionDirection: "row",
    buttonType: "token-filter",
    question: () => applyDrill(drill, operator),
  };

  if (Lib.isDate(column)) {
    const dateAction: ClickAction = {
      ...action,
      sectionTitle: t`Filter by this date`,
      sectionDirection: "column",
      buttonType: "horizontal",
    };

    switch (operator) {
      case "=":
        return {
          ...dateAction,
          title: t`On`,
        };
      case "≠":
        return {
          ...dateAction,
          title: t`Not on`,
        };
      case ">":
        return {
          ...dateAction,
          title: t`After`,
        };
      case "<":
        return {
          ...dateAction,
          title: t`Before`,
        };
      default:
        return dateAction;
    }
  }

  if (Lib.isString(column)) {
    const stringAction: ClickAction = {
      ...action,
      sectionDirection: "column",
      buttonType: "horizontal",
    };
    const valueTitle = getTextValueTitle(String(value));

    switch (operator) {
      case "=":
        return {
          ...stringAction,
          title: t`Is ${valueTitle}`,
        };
      case "≠":
        return {
          ...stringAction,
          title: t`Is not ${valueTitle}`,
        };
      case "contains": {
        return {
          ...stringAction,
          title: `Contains…`,
          popover: () => <div />,
        };
      }
      case "does-not-contain": {
        return {
          ...stringAction,
          title: `Does not contain…`,
          popover: () => <div />,
        };
      }
      default:
        return stringAction;
    }
  }

  return action;
}
