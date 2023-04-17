import cx from "classnames";
import { t } from "ttag";
import { Link } from "react-router";
import React from "react";
import _ from "underscore";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import Tooltip from "metabase/core/components/Tooltip";
import Icon from "metabase/components/Icon/Icon";
import { ClickAction } from "metabase-types/types/Visualization";
import {
  ClickActionButton,
  ClickActionButtonType,
} from "./ChartClickActions.styled";
import { getGALabelForAction, SECTIONS } from "./config";

type ClickActionWithButtonType = ClickAction & {
  buttonType?: ClickActionButtonType;
};
interface Props {
  clickActions: ClickAction[];

  onClick: (action: ClickAction) => void;
}

const ChartClickActionsView = ({
  clickActions,
  onClick,
}: Props): JSX.Element => {
  const groupedClickActions: Record<string, ClickActionWithButtonType[]> =
    _.groupBy(clickActions, "section");

  if (groupedClickActions?.["sum"]?.length === 1) {
    // if there's only one "sum" click action, merge it into "summarize" and change its button type and icon
    if (!groupedClickActions?.["summarize"]) {
      groupedClickActions["summarize"] = [];
    }
    groupedClickActions["summarize"].push({
      ...groupedClickActions["sum"][0],
      buttonType: "horizontal",
      icon: "number",
    });
    delete groupedClickActions["sum"];
  }
  const hasOnlyOneSortAction = groupedClickActions["sort"]?.length === 1;
  if (hasOnlyOneSortAction) {
    // restyle the Formatting action when there is only one option
    groupedClickActions["sort"][0] = {
      ...groupedClickActions["sort"][0],
      buttonType: "horizontal",
    };
  }
  const sections = _.chain(groupedClickActions)
    .pairs()
    .sortBy(([key]) => (SECTIONS[key] ? SECTIONS[key].index : 99))
    .value();

  const hasOnlyOneSection = sections.length === 1;

  return (
    <div className="text-bold px2 pt2 pb1">
      {sections.map(([key, actions]) => (
        <div
          key={key}
          className={cx(
            "pb1",
            { pb2: SECTIONS[key].icon === "bolt" },
            {
              ml1:
                SECTIONS[key].icon === "bolt" ||
                SECTIONS[key].icon === "sum" ||
                SECTIONS[key].icon === "breakout" ||
                (SECTIONS[key].icon === "funnel_outline" && !hasOnlyOneSection),
            },
          )}
        >
          {SECTIONS[key].icon === "sum" && (
            <p className="mt0 text-medium text-small">{t`Summarize`}</p>
          )}
          {SECTIONS[key].icon === "breakout" && (
            <p className="my1 text-medium text-small">{t`Break out by a…`}</p>
          )}
          {SECTIONS[key].icon === "bolt" && (
            <p className="mt2 text-medium text-small">
              {t`Automatic explorations`}
            </p>
          )}
          {SECTIONS[key].icon === "funnel_outline" && (
            <p
              className={cx(
                "text-small",
                hasOnlyOneSection ? "mt0" : "mt2",
                hasOnlyOneSection ? "text-dark" : "text-medium",
              )}
            >
              {t`Filter by this value`}
            </p>
          )}

          <div
            className={cx(
              "flex",
              {
                "justify-end": SECTIONS[key].icon === "gear",
              },
              {
                "align-center justify-center": SECTIONS[key].icon === "gear",
              },
              { "flex-column my1": SECTIONS[key].icon === "summarize" },
            )}
          >
            {actions.map((action, index) => {
              const className = cx("no-decoration", {
                "cursor-pointer": action.buttonType !== "info",
                sort: action.buttonType === "sort",
                "formatting-button": action.buttonType === "formatting",
                "horizontal-button": action.buttonType === "horizontal",
              });
              const isLastItem = index === actions.length - 1;

              if (action.url) {
                return (
                  <div
                    className={cx({
                      full: action.buttonType === "horizontal",
                    })}
                  >
                    <ClickActionButton
                      as={Link}
                      className={className}
                      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                      // @ts-ignore // TODO: remove this after styled component is done
                      to={action.url()}
                      type={action.buttonType}
                      onClick={() =>
                        MetabaseAnalytics.trackStructEvent(
                          "Actions",
                          "Executed Click Action",
                          getGALabelForAction(action),
                        )
                      }
                    >
                      {action.title}
                    </ClickActionButton>
                  </div>
                );
              } else if (
                action.buttonType === "sort" ||
                action.buttonType === "formatting"
              ) {
                return (
                  <Tooltip tooltip={action.tooltip}>
                    <ClickActionButton
                      className={cx(className, "flex flex-row align-center")}
                      type={action.buttonType}
                      onClick={() => onClick(action)}
                    >
                      {action.icon && (
                        <Icon
                          className={cx("flex mr1", {
                            "text-brand text-white-hover":
                              action.buttonType !== "formatting",
                          })}
                          size={action.buttonType === "formatting" ? 16 : 12}
                          name={action.icon}
                        />
                      )}
                    </ClickActionButton>
                  </Tooltip>
                );
              } else {
                return (
                  <ClickActionButton
                    className={cx(className, {
                      mb1: action.buttonType === "horizontal" && !isLastItem,
                    })}
                    type={action.buttonType}
                    onClick={() => onClick(action)}
                  >
                    {action.icon && (
                      <Icon
                        className="flex mr1 text-brand text-white-hover"
                        size={action.buttonType === "horizontal" ? 14 : 12}
                        name={action.icon}
                      />
                    )}
                    {action.title && action.title}
                  </ClickActionButton>
                );
              }
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ChartClickActionsView;
