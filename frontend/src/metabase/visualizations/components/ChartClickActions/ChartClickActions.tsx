import React, { Component } from "react";
import { connect } from "react-redux";
import * as tippy from "tippy.js";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { getEventTarget } from "metabase/lib/dom";
import { performAction } from "metabase/visualizations/lib/action";
import {
  ClickAction,
  ClickObject,
  OnChangeCardAndRun,
} from "metabase-types/types/Visualization";
import { Dispatch } from "metabase-types/store";
import { Series } from "metabase-types/api";

import "./ChartClickActions.css";
import ChartClickActionsView from "./ChartClickActionsView";
import { getGALabelForAction } from "./utils";
import { FlexTippyPopover } from "./ChartClickActions.styled";

interface ChartClickActionsProps {
  clicked: ClickObject;
  clickActions: ClickAction[];
  series: Series;
  dispatch: Dispatch;
  onChangeCardAndRun: OnChangeCardAndRun;
  onUpdateVisualizationSettings: () => void;
  onClose?: () => void;
}

interface State {
  popoverAction: ClickAction | null;
}

class ChartClickActions extends Component<ChartClickActionsProps, State> {
  state: State = {
    popoverAction: null,
  };

  instance: tippy.Instance | null = null;

  close = () => {
    this.setState({ popoverAction: null });
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  handleClickAction = (action: ClickAction) => {
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

  getPopoverReference = (clicked: ClickObject): HTMLElement | null => {
    if (clicked.element) {
      if (clicked.element.firstChild instanceof HTMLElement) {
        return clicked.element.firstChild;
      } else {
        return clicked.element;
      }
    } else if (clicked.event) {
      return getEventTarget(clicked.event);
    }

    return null;
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
            <ChartClickActionsView
              clickActions={clickActions}
              onClick={this.handleClickAction}
            />
          )
        }
        {...popoverAction?.popoverProps}
      />
    );
  }
}

export default connect()(ChartClickActions);
