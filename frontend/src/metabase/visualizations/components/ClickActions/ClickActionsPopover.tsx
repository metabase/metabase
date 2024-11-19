import { Component } from "react";
import { connect } from "react-redux";
import type * as tippy from "tippy.js";

import { getEventTarget } from "metabase/lib/dom";
import { performAction } from "metabase/visualizations/lib/action";
import type {
  ClickObject,
  OnChangeCardAndRun,
  PopoverClickAction,
  RegularClickAction,
} from "metabase/visualizations/types";
import { isPopoverClickAction } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type { Series } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { FlexTippyPopover } from "./ClickActionsPopover.styled";
import { ClickActionsView } from "./ClickActionsView";

interface ChartClickActionsProps {
  clicked: ClickObject;
  clickActions: RegularClickAction[];
  series: Series;
  dispatch: Dispatch;
  onChangeCardAndRun: OnChangeCardAndRun;
  onUpdateVisualizationSettings: () => void;
  onUpdateQuestion?: (question: Question) => void;
  onClose?: () => void;
}

interface State {
  popoverAction: PopoverClickAction | null;
}

export class ClickActionsPopover extends Component<
  ChartClickActionsProps,
  State
> {
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

  handleClickAction = (action: RegularClickAction) => {
    const { dispatch, onChangeCardAndRun, onUpdateQuestion } = this.props;
    if (isPopoverClickAction(action)) {
      this.setState({ popoverAction: action });
    } else {
      const didPerform = performAction(action, {
        dispatch,
        onChangeCardAndRun,
        onUpdateQuestion,
      });
      if (didPerform) {
        this.close();
      } else {
        console.warn("No action performed", action);
      }
    }
  };

  getPopoverReference = (clicked: ClickObject): Element | null => {
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
          onClick={this.handleClickAction}
          onResize={() => {
            this.instance?.popperInstance?.update();
          }}
          onChangeCardAndRun={({ nextCard }) => {
            onChangeCardAndRun({ nextCard });
          }}
          onClose={() => {
            this.close();
          }}
          series={series}
          onUpdateVisualizationSettings={onUpdateVisualizationSettings}
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
          this.close();
        }}
        placement="bottom-start"
        maxWidth={700}
        offset={[0, 8]}
        popperOptions={{
          modifiers: [
            {
              name: "preventOverflow",
              options: {
                padding: 16,
                altAxis: true,
                tether: false,
              },
            },
          ],
        }}
        content={
          popover ? (
            popover
          ) : (
            <ClickActionsView
              clickActions={clickActions}
              close={this.close}
              onClick={this.handleClickAction}
            />
          )
        }
        {...popoverAction?.popoverProps}
      />
    );
  }
}

export const ConnectedClickActionsPopover = connect()(ClickActionsPopover);
