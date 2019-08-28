/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import Popover from "metabase/components/Popover";
import { Link } from "react-router";

import MetabaseAnalytics from "metabase/lib/analytics";

import { performAction } from "metabase/visualizations/lib/action";

import type {
  ClickObject,
  ClickAction,
} from "metabase/meta/types/Visualization";

import _ from "underscore";

const SECTIONS = {
  zoom: {
    icon: "zoom_in",
  },
  records: {
    icon: "table2",
  },
  details: {
    icon: "document",
  },
  sort: {
    icon: "sort",
  },
  breakout: {
    icon: "breakout",
  },
  sum: {
    icon: "sum",
  },
  averages: {
    icon: "curve",
  },
  distribution: {
    icon: "bar",
  },
  filter: {
    icon: "funnel_outline",
  },
  dashboard: {
    icon: "dashboard",
  },
  auto: {
    icon: "bolt",
  },
  formatting: {
    icon: "pencil",
  },
};
// give them indexes so we can sort the sections by the above ordering (JS objects are ordered)
Object.values(SECTIONS).map((section, index) => {
  // $FlowFixMe
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
    // $FlowFixMe: dispatch provided by @connect
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

    const sections = _.chain(clickActions)
      .groupBy("section")
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
          <div className="text-bold text-medium">
            {sections.map(([key, actions]) => (
              <div
                key={key}
                className="border-row-divider p2 flex align-center text-default-hover"
              >
                <Icon
                  name={(SECTIONS[key] && SECTIONS[key].icon) || "unknown"}
                  className="mr3"
                  size={16}
                />
                {actions.map((action, index) => (
                  <ChartClickAction
                    index={index}
                    action={action}
                    isLastItem={index === actions.length - 1}
                    handleClickAction={this.handleClickAction}
                  />
                ))}
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
  const className = cx(
    "text-brand-hover cursor-pointer no-decoration",
    isLastItem ? "pr2" : "pr3",
  );
  // NOTE: Tom Robinson 4/16/2018: disabling <Link> for `question` click actions
  // for now since on dashboards currently they need to go through
  // navigateToNewCardFromDashboard to merge in parameters.,
  // Also need to sort out proper logic in QueryBuilder's componentWillReceiveProps
  // if (action.question) {
  //   return (
  //     <Link to={action.question().getUrl()} className={className}>
  //       {action.title}
  //     </Link>
  //   );
  // } else
  if (action.url) {
    return (
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
    );
  } else {
    return (
      <div className={className} onClick={() => handleClickAction(action)}>
        {action.title}
      </div>
    );
  }
};
