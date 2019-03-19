import React from "react";

import { t } from "c-3po";

import colors, { lighten } from "metabase/lib/colors";

import Button from "metabase/components/Button";
import { Box } from "grid-styled";

import NotebookStepPreview from "./NotebookStepPreview";
import NotebookCell from "./NotebookCell";

import DataStep from "./steps/DataStep";
import ExpressionStep from "./steps/ExpressionStep";
import FilterStep from "./steps/FilterStep";
import AggregateStep from "./steps/AggregateStep";
import BreakoutStep from "./steps/BreakoutStep";

const STEP_UI = {
  data: {
    component: DataStep,
  },
  expression: {
    title: t`Custom fields`,
    color: colors["text-medium"],
    icon: "addtodash",
    component: ExpressionStep,
  },
  filter: {
    title: t`Filter`,
    color: colors["accent7"],
    icon: "funneladd",
    component: FilterStep,
  },
  aggregate: {
    title: t`Aggregate`,
    color: colors["accent1"],
    icon: "sum",
    component: AggregateStep,
  },
  breakout: {
    title: t`Breakout`,
    color: colors["accent4"],
    icon: "segment",
    component: BreakoutStep,
  },
};

export default class NotebookStep extends React.Component {
  state = {
    showPreview: false,
  };

  render() {
    const { step, openStep } = this.props;
    const { showPreview } = this.state;

    const { title, color, component: NotebookStepComponent } =
      STEP_UI[step.type] || {};

    const actionButtons = [];
    if (!showPreview && step.previewQuery) {
      actionButtons.push(
        <ActionButton
          mr={1}
          icon="right"
          onClick={() => this.setState({ showPreview: true })}
        />,
      );
    }
    actionButtons.push(
      ...step.actions.map(action => (
        <ActionButton
          mr={1}
          {...STEP_UI[action.type] || {}}
          onClick={() => action.action(this.props)}
        />
      )),
    );

    return (
      <Box mb={2}>
        {title && (
          <Box mb={1} className="text-bold" style={{ color }}>
            {title}
          </Box>
        )}

        {NotebookStepComponent && (
          <NotebookStepComponent color={color} query={step.query} />
        )}

        {showPreview &&
          step.previewQuery && (
            <NotebookStepPreview
              step={step}
              onClose={() => this.setState({ showPreview: false })}
            />
          )}

        {actionButtons.length > 0 && <Box mt={2}>{actionButtons}</Box>}
      </Box>
    );
  }
}

const ActionButton = ({ icon, color, onClick, ...props }) => {
  return (
    <Button
      icon={icon}
      style={{ color, backgroundColor: color ? lighten(color, 0.35) : null }}
      small
      borderless
      className="text-medium bg-medium"
      onClick={onClick}
      {...props}
    />
  );
};
