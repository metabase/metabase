/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import _ from "underscore";
import cx from "classnames";
import { Link } from "react-router";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { singularize, stripId } from "metabase/lib/formatting";

import "./ChartClickActions.css";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { getEventTarget } from "metabase/lib/dom";

import { performAction } from "metabase/visualizations/lib/action";

import {
  ClickActionButton,
  FlexTippyPopover,
} from "./ChartClickActions.styled";

// These icons used to be displayed for each row section of actions.
// We're now just using them as a way to select different sections of actions to style them uniquely.
// They're not all used, but I've kept them here in case we need these hooks in the future.
const SECTIONS = {
  records: {
    icon: "table2",
  },
  zoom: {
    icon: "zoom_in",
  },
  sort: {
    icon: "sort",
  },
  formatting: {
    icon: "gear",
  },
  breakout: {
    icon: "breakout",
  },
  standalone_filter: {
    icon: "filter",
  },
  shortcut: {
    icon: "shortcut",
  },
  filter: {
    icon: "funnel_outline",
  },
  // There is no such icon as "summarize." This is used to ID and select the actions that we,
  // want to make larger, like Distribution, Sum over Time, etc.
  summarize: {
    icon: "summarize",
  },
  sum: {
    icon: "sum",
  },
  averages: {
    icon: "curve",
  },
  dashboard: {
    icon: "dashboard",
  },
  auto: {
    icon: "bolt",
  },
  details: {
    icon: "expand",
    separator: true,
  },
};
// give them indexes so we can sort the sections by the above ordering (JS objects are ordered)
Object.values(SECTIONS).map((section, index) => {
  section.index = index;
});

const getGALabelForAction = action =>
  action ? `${action.section || ""}:${action.name || ""}` : null;

class ChartClickActions extends Component {
  state = {
    popoverAction: null,
  };

  close = () => {
    this.setState({ popoverAction: null });
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  handleClickAction = action => {
    const { dispatch, onChangeCardAndRun } = this.props;
    if (action.popover) {
      MetabaseAnalytics.trackStructEvent(
        "Actions",
        "Open Click Action Popover",
        getGALabelForAction(action),
      );
      this.setState({ popoverAction: action });
    } else {
      const didPerform = performAction(action, {
        dispatch,
        onChangeCardAndRun,
      });
      if (didPerform) {
        MetabaseAnalytics.trackStructEvent(
          "Actions",
          "Executed Click Action",
          getGALabelForAction(action),
        );
        this.close();
      } else {
        console.warn("No action performed", action);
      }
    }
  };

  getPopoverReference = clicked => {
    if (clicked.element) {
      if (clicked.element.firstChild instanceof HTMLElement) {
        return clicked.element.firstChild;
      } else {
        return clicked.element;
      }
    } else if (clicked.event) {
      return getEventTarget(clicked.event);
    }
  };

  render() {
    const {
      clicked,
      clickActions,
      onChangeCardAndRun,
      series,
      onUpdateVisualizationSettings,
    } = this.props;

    if (!clicked || !clickActions || clickActions.length === 0) {
      return null;
    }

    const { popoverAction } = this.state;
    let popover;
    if (popoverAction && popoverAction.popover) {
      const PopoverContent = popoverAction.popover;
      popover = (
        <PopoverContent
          onResize={() => {
            this.instance?.popperInstance?.update();
          }}
          onChangeCardAndRun={({ nextCard }) => {
            if (popoverAction) {
              MetabaseAnalytics.trackStructEvent(
                "Action",
                "Executed Click Action",
                getGALabelForAction(popoverAction),
              );
            }
            onChangeCardAndRun({ nextCard });
          }}
          onClose={() => {
            MetabaseAnalytics.trackStructEvent(
              "Action",
              "Dismissed Click Action Menu",
              getGALabelForAction(popoverAction),
            );
            this.close();
          }}
          series={series}
          onChange={onUpdateVisualizationSettings}
        />
      );
    }

    const groupedClickActions = _.groupBy(clickActions, "section");

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

    const popoverAnchor = this.getPopoverReference(clicked);

    return (
      <FlexTippyPopover
        reference={popoverAnchor}
        visible={!!popoverAnchor}
        onShow={instance => {
          this.instance = instance;
        }}
        onClose={() => {
          MetabaseAnalytics.trackStructEvent(
            "Action",
            "Dismissed Click Action Menu",
          );
          this.close();
        }}
        placement="bottom-start"
        offset={[0, 8]}
        popperOptions={{
          flip: true,
          modifiers: [
            {
              name: "preventOverflow",
              options: {
                padding: 16,
              },
            },
          ],
        }}
        content={
          popover ? (
            popover
          ) : (
            <div className="text-bold py2">
              {sections.map(([key, actions], index) => (
                <div
                  key={key}
                  className={cx(
                    { pb2: SECTIONS[key].icon === "bolt" },
                    { px2: !SECTIONS[key].separator },
                    {
                      ml1:
                        SECTIONS[key].icon === "bolt" ||
                        SECTIONS[key].icon === "sum" ||
                        SECTIONS[key].icon === "breakout" ||
                        (SECTIONS[key].icon === "funnel_outline" &&
                          !hasOnlyOneSection),
                    },
                  )}
                >
                  {SECTIONS[key].icon === "sum" && (
                    <div className="mb1 text-medium text-small">{t`Summarize`}</div>
                  )}
                  {SECTIONS[key].icon === "breakout" && (
                    <div className="mb1 text-medium text-small">{t`Break out by a…`}</div>
                  )}
                  {SECTIONS[key].icon === "bolt" && (
                    <div className="mt2 text-medium text-small">
                      {t`Automatic explorations`}
                    </div>
                  )}
                  {SECTIONS[key].icon === "funnel_outline" && (
                    <div className={cx("mb1 text-small text-medium")}>
                      {t`Filter by this value`}
                    </div>
                  )}
                  {SECTIONS[key].icon === "shortcut" && (
                    <div className={cx("mb1 text-small text-medium")}>
                      {t`Filter by ${singularize(
                        stripId(clicked.column.display_name),
                      )}`}
                    </div>
                  )}

                  <div
                    className={cx("flex ", {
                      "border-top mt2 pt2 px2":
                        SECTIONS[key].separator &&
                        index === sections.length - 1,
                      "justify-end": SECTIONS[key].icon === "gear",
                      "align-center justify-center":
                        SECTIONS[key].icon === "gear",
                      "flex-column my1":
                        SECTIONS[key].icon === "summarize" ||
                        SECTIONS[key].icon === "shortcut",
                    })}
                  >
                    {actions.map((action, index) => (
                      <ChartClickAction
                        key={index}
                        action={action}
                        isLastItem={index === actions.length - 1}
                        handleClickAction={this.handleClickAction}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        }
        {...popoverAction?.popoverProps}
      />
    );
  }
}

export default connect()(ChartClickActions);

export const ChartClickAction = ({ action, isLastItem, handleClickAction }) => {
  // This is where all the different action button styles get applied.
  // Some of them have bespoke classes defined in ChartClickActions.css,
  // like for cases when we needed to really dial in the spacing.
  const className = cx("cursor-pointer no-decoration", {
    sort: action.buttonType === "sort",
    "formatting-button": action.buttonType === "formatting",
    "horizontal-button": action.buttonType === "horizontal",
  });
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
          onClick={() => handleClickAction(action)}
        >
          {action.icon && (
            <Icon
              className={cx("flex mr1", {
                "text-dark text-white-hover":
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
        onClick={() => handleClickAction(action)}
      >
        {action.icon && (
          <Icon
            className="flex mr1 text-dark text-white-hover"
            size={action.buttonType === "horizontal" ? 14 : 12}
            name={action.icon}
          />
        )}
        {action.title && action.title}
      </ClickActionButton>
    );
  }
};
