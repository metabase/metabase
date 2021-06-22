/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { Link } from "react-router";
import Icon from "metabase/components/Icon";
import Popover from "metabase/components/Popover";
import Tooltip from "metabase/components/Tooltip";

import "./ChartClickActions.css";

import MetabaseAnalytics from "metabase/lib/analytics";

import { performAction } from "metabase/visualizations/lib/action";

import type {
  ClickObject,
  ClickAction,
} from "metabase-types/types/Visualization";

import cx from "classnames";
import _ from "underscore";

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
  details: {
    icon: "document",
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
};
// give them indexes so we can sort the sections by the above ordering (JS objects are ordered)
Object.values(SECTIONS).map((section, index) => {
  section.index = index;
});

const getGALabelForAction = action =>
  action ? `${action.section || ""}:${action.name || ""}` : null;

type Props = {
  clicked: ?ClickObject,
  clickActions: ?(ClickAction[]),
  onChangeCardAndRun: Object => void,
  onClose: () => void,
};

type State = {
  popoverAction: ?ClickAction,
};

@connect()
export default class ChartClickActions extends Component {
  props: Props;
  state: State = {
    popoverAction: null,
  };

  close = () => {
    this.setState({ popoverAction: null });
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  handleClickAction = (action: ClickAction) => {
    const { dispatch, onChangeCardAndRun } = this.props;
    if (action.popover) {
      MetabaseAnalytics.trackEvent(
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
        MetabaseAnalytics.trackEvent(
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

  render() {
    const { clicked, clickActions, onChangeCardAndRun } = this.props;

    if (!clicked || !clickActions || clickActions.length === 0) {
      return null;
    }

    const { popoverAction } = this.state;
    let popover;
    if (popoverAction && popoverAction.popover) {
      const PopoverContent = popoverAction.popover;
      popover = (
        <PopoverContent
          onChangeCardAndRun={({ nextCard }) => {
            if (popoverAction) {
              MetabaseAnalytics.trackEvent(
                "Action",
                "Executed Click Action",
                getGALabelForAction(popoverAction),
              );
            }
            onChangeCardAndRun({ nextCard });
          }}
          onClose={() => {
            MetabaseAnalytics.trackEvent(
              "Action",
              "Dismissed Click Action Menu",
              getGALabelForAction(popoverAction),
            );
            this.close();
          }}
        />
      );
    }

    const groupedClickActions = _.groupBy(clickActions, "section");
    if (groupedClickActions["sum"] && groupedClickActions["sum"].length === 1) {
      // if there's only one "sum" click action, merge it into "summarize" and change its button type and icon
      groupedClickActions["summarize"].push({
        ...groupedClickActions["sum"][0],
        buttonType: "horizontal",
        icon: "number",
      });
      delete groupedClickActions["sum"];
    }
    if (
      clicked.column &&
      clicked.column.source === "native" &&
      groupedClickActions["sort"]
    ) {
      // restyle the Formatting action for SQL columns
      groupedClickActions["sort"][0] = {
        ...groupedClickActions["sort"][0],
        buttonType: "horizontal",
      };
    }
    const sections = _.chain(groupedClickActions)
      .pairs()
      .sortBy(([key]) => (SECTIONS[key] ? SECTIONS[key].index : 99))
      .value();

    return (
      <Popover
        target={clicked.element}
        targetEvent={clicked.event}
        onClose={() => {
          MetabaseAnalytics.trackEvent("Action", "Dismissed Click Action Menu");
          this.close();
        }}
        verticalAttachments={["top", "bottom"]}
        horizontalAttachments={["left", "center", "right"]}
        sizeToFit
        pinInitialAttachment
      >
        {popover ? (
          popover
        ) : (
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
                      SECTIONS[key].icon === "breakout",
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
                  <p className="mt0 text-dark text-small">
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
                      "align-center justify-center":
                        SECTIONS[key].icon === "gear",
                    },
                    { "flex-column my1": SECTIONS[key].icon === "summarize" },
                  )}
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
        )}
      </Popover>
    );
  }
}

export const ChartClickAction = ({
  action,
  isLastItem,
  handleClickAction,
}: {
  action: any,
  isLastItem: any,
  handleClickAction: any,
}) => {
  // This is where all the different action button styles get applied.
  // Some of them have bespoke classes defined in ChartClickActions.css,
  // like for cases when we needed to really dial in the spacing.
  const className = cx("cursor-pointer no-decoration", {
    "text-center sort token-blue mr1 bg-brand-hover":
      action.buttonType === "sort",
    "formatting-button flex-align-right text-brand-hover text-light":
      action.buttonType === "formatting",
    "horizontal-button p1 flex flex-auto align-center bg-brand-hover text-dark text-white-hover":
      action.buttonType === "horizontal",
    "text-small token token-blue text-white-hover bg-brand-hover mr1":
      action.buttonType === "token",
    "token token-filter text-small text-white-hover mr1":
      action.buttonType === "token-filter",
  });
  // NOTE: Tom Robinson 4/16/2018: disabling <Link> for `question` click actions
  // for now since on dashboards currently they need to go through
  // navigateToNewCardFromDashboard to merge in parameters.,
  // Also need to sort out proper logic in QueryBuilder's UNSAFE_componentWillReceiveProps
  // if (action.question) {
  //   return (
  //     <Link to={action.question().getUrl()} className={className}>
  //       {action.title}
  //     </Link>
  //   );
  // } else
  if (action.url) {
    return (
      <div>
        <Link
          to={action.url()}
          className={className}
          onClick={() =>
            MetabaseAnalytics.trackEvent(
              "Actions",
              "Executed Click Action",
              getGALabelForAction(action),
            )
          }
        >
          {action.title}
        </Link>
      </div>
    );
  } else if (
    action.buttonType === "sort" ||
    action.buttonType === "formatting"
  ) {
    return (
      <Tooltip tooltip={action.tooltip}>
        <div
          className={cx(className, "flex flex-row align-center")}
          onClick={() => handleClickAction(action)}
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
        </div>
      </Tooltip>
    );
  } else {
    return (
      <div
        className={cx(className, {
          mb1: action.buttonType === "horizontal" && !isLastItem,
        })}
        onClick={() => handleClickAction(action)}
      >
        {action.icon && (
          <Icon
            className="flex mr1 text-brand text-white-hover"
            size={action.buttonType === "horizontal" ? 14 : 12}
            name={action.icon}
          />
        )}
        {action.title && action.title}
      </div>
    );
  }
};
