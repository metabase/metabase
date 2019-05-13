import React from "react";

import { t } from "ttag";

import colors, { lighten } from "metabase/lib/colors";

import Tooltip from "metabase/components/Tooltip";
import Button from "metabase/components/Button";
import { Box } from "grid-styled";

import NotebookStepPreview from "./NotebookStepPreview";

import DataStep from "./steps/DataStep";
import JoinStep from "./steps/JoinStep";
import ExpressionStep from "./steps/ExpressionStep";
import FilterStep from "./steps/FilterStep";
import AggregateStep from "./steps/AggregateStep";
import BreakoutStep from "./steps/BreakoutStep";
import SortStep from "./steps/SortStep";
import LimitStep from "./steps/LimitStep";

const STEP_UI = {
  data: {
    component: DataStep,
  },
  join: {
    title: t`Add data`,
    color: colors["brand"],
    icon: "join_left_outer",
    component: JoinStep,
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
    priority: 10,
  },
  aggregate: {
    title: t`Summarize`,
    color: colors["accent1"],
    icon: "sum",
    component: AggregateStep,
    priority: 5,
  },
  breakout: {
    title: t`Breakout`,
    color: colors["accent4"],
    icon: "segment",
    component: BreakoutStep,
    priority: 1,
  },
  sort: {
    title: t`Sort`,
    color: colors["text-medium"],
    icon: "smartscalar",
    component: SortStep,
  },
  limit: {
    title: t`Limit`,
    color: colors["text-medium"],
    icon: "bolt",
    component: LimitStep,
  },
};

export default class NotebookStep extends React.Component {
  state = {
    showPreview: false,
  };

  render() {
    const { step, openStep, isLastOpened } = this.props;
    const { showPreview } = this.state;

    const { title, color, component: NotebookStepComponent } =
      STEP_UI[step.type] || {};

    const canPreview = step.previewQuery && step.previewQuery.canRun();

    const actions = [];
    actions.push(
      ...step.actions.map(action => ({
        priority: (STEP_UI[action.type] || {}).priority,
        element: <ActionButton
          mr={1}
          {...STEP_UI[action.type] || {}}
          onClick={() => action.action(this.props)}
        />
    })),
    );
    if (!showPreview && canPreview) {
      actions.push({
        element: <ActionButton
          mr={1}
          icon="right"
          title={t`Preview`}
          onClick={() => this.setState({ showPreview: true })}
        />,
    });
    }

    actions.sort((a,b) => (b.priority || 0) - (a.priority || 0));
    const actionButtons = actions.map(action => action.element)

    return (
      <Box mb={2} pb={2} className="border-row-divider">
        {title && (
          <Box mb={1} className="text-bold" style={{ color }}>
            {title}
          </Box>
        )}

        {NotebookStepComponent && (
          <NotebookStepComponent
            color={color}
            query={step.query}
            isLastOpened={isLastOpened}
          />
        )}

        {showPreview && canPreview && (
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

const ActionButton = ({ icon, title, color, onClick, ...props }) => {
  return (
    <Tooltip tooltip={title}>
      <Button
        icon={icon}
        style={{ color, backgroundColor: color ? lighten(color, 0.35) : null }}
        small
        borderless
        className="text-medium bg-medium"
        onClick={onClick}
        {...props}
      />
    </Tooltip>
  );
};
