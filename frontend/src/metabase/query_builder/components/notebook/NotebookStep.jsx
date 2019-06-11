import React from "react";

import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";

import colors, { lighten } from "metabase/lib/colors";

import Tooltip from "metabase/components/Tooltip";
import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";
import { Box, Flex } from "grid-styled";

import NotebookStepPreview from "./NotebookStepPreview";

import DataStep from "./steps/DataStep";
import JoinStep from "./steps/JoinStep";
import ExpressionStep from "./steps/ExpressionStep";
import FilterStep from "./steps/FilterStep";
import AggregateStep from "./steps/AggregateStep";
import BreakoutStep from "./steps/BreakoutStep";
import SummarizeStep from "./steps/SummarizeStep";
import SortStep from "./steps/SortStep";
import LimitStep from "./steps/LimitStep";

const STEP_UI = {
  data: {
    title: t`Data`,
    color: colors["brand"],
    component: DataStep,
  },
  join: {
    title: t`Join data`,
    color: colors["brand"],
    icon: "join_left_outer",
    component: JoinStep,
    priority: 1,
  },
  expression: {
    title: t`Add column`,
    color: colors["text-medium"],
    icon: "add_data",
    component: ExpressionStep,
  },
  filter: {
    title: t`Filter`,
    color: colors["accent7"],
    icon: "filter",
    component: FilterStep,
    priority: 10,
  },
  summarize: {
    title: t`Summarize`,
    color: colors["accent1"],
    icon: "sum",
    component: SummarizeStep,
    priority: 5,
  },
  // aggregate: {
  //   title: t`Summarize`,
  //   color: colors["accent1"],
  //   icon: "sum",
  //   component: AggregateStep,
  //   priority: 5,
  // },
  // breakout: {
  //   title: t`Breakout`,
  //   color: colors["accent4"],
  //   icon: "segment",
  //   component: BreakoutStep,
  //   priority: 1,
  // },
  sort: {
    title: t`Sort`,
    color: colors["text-medium"],
    icon: "smartscalar",
    component: SortStep,
    compact: true,
  },
  limit: {
    title: t`Row limit`,
    color: colors["text-medium"],
    icon: "list",
    component: LimitStep,
    compact: true,
  },
};

export default class NotebookStep extends React.Component {
  state = {
    showPreview: false,
  };

  render() {
    const {
      step,
      openStep,
      isLastStep,
      isLastOpened,
      updateQuery,
    } = this.props;
    const { showPreview } = this.state;

    const { title, color, component: NotebookStepComponent } =
      STEP_UI[step.type] || {};

    const canPreview = step.previewQuery && step.previewQuery.canRun();
    const showPreviewButton = !showPreview && canPreview;

    const largeActionButtons =
      isLastStep &&
      _.any(step.actions, action => !STEP_UI[action.type].compact);

    const actions = [];
    actions.push(
      ...step.actions.map(action => ({
        priority: (STEP_UI[action.type] || {}).priority,
        button: (
          <ActionButton
            mr={isLastStep ? 2 : 1}
            mt={isLastStep ? 2 : null}
            large={largeActionButtons}
            {...STEP_UI[action.type] || {}}
            onClick={() => action.action({ query: step.query, openStep })}
          />
        ),
      })),
    );

    actions.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const actionButtons = actions.map(action => action.button);

    const onRemove = step.step.revert
      ? () => {
          step.step.revert(step.query).update(updateQuery);
        }
      : null;

    return (
      <Box mb={3} pb={3}>
        {(title || onRemove) && (
          <Flex mb={1} width={[8 / 12]} className="text-bold" style={{ color }}>
            {title}
            {onRemove && (
              <Icon
                name="close"
                className="ml-auto cursor-pointer text-light text-medium-hover"
                tooltip={t`Remove`}
                onClick={onRemove}
              />
            )}
          </Flex>
        )}

        {NotebookStepComponent && (
          <Flex align="center">
            <Box width={[8 / 12]}>
              <NotebookStepComponent
                color={color}
                query={step.query}
                updateQuery={updateQuery}
                isLastOpened={isLastOpened}
              />
            </Box>
            <Box width={[1 / 12]}>
              <ActionButton
                ml={2}
                className={!showPreviewButton ? "hidden disabled" : null}
                icon="right"
                title={t`Preview`}
                color={colors["text-medium"]}
                onClick={() => this.setState({ showPreview: true })}
              />
            </Box>
          </Flex>
        )}

        {showPreview && canPreview && (
          <NotebookStepPreview
            step={step}
            onClose={() => this.setState({ showPreview: false })}
          />
        )}

        {actionButtons.length > 0 && <Box mt={1}>{actionButtons}</Box>}
      </Box>
    );
  }
}

const ActionButton = ({ icon, title, color, large, onClick, ...props }) => {
  const button = (
    <Button
      icon={icon}
      style={{
        color,
        backgroundColor: color ? lighten(color, 0.61) : null,
        borderColor: lighten(color, 0.35),
      }}
      small={!large}
      iconVertical={large}
      iconSize={large ? 18 : 14}
      className="text-medium bg-medium"
      onClick={onClick}
      {...props}
    >
      {large ? title : null}
    </Button>
  );

  return large ? button : <Tooltip tooltip={title}>{button}</Tooltip>;
};
