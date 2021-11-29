/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";
import _ from "underscore";

import styled from "styled-components";

import { color as c, lighten, darken } from "metabase/lib/colors";

import Tooltip from "metabase/components/Tooltip";
import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";
import ExpandingContent from "metabase/components/ExpandingContent";
import { forwardRefToInnerRef } from "metabase/styled-components/utils";

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

// TODO
const STEP_UI = {
  data: {
    title: t`Data`,
    component: DataStep,
    getColor: () => c("brand"),
  },
  join: {
    title: t`Join data`,
    icon: "join_left_outer",
    component: JoinStep,
    priority: 1,
    getColor: () => c("brand"),
  },
  expression: {
    title: t`Custom column`,
    icon: "add_data",
    component: ExpressionStep,
    getColor: () => c("bg-dark"),
  },
  filter: {
    title: t`Filter`,
    icon: "filter",
    component: FilterStep,
    priority: 10,
    getColor: () => c("accent7"),
  },
  summarize: {
    title: t`Summarize`,
    icon: "sum",
    component: SummarizeStep,
    priority: 5,
    getColor: () => c("accent1"),
  },
  aggregate: {
    title: t`Aggregate`,
    icon: "sum",
    component: AggregateStep,
    priority: 5,
    getColor: () => c("accent1"),
  },
  breakout: {
    title: t`Breakout`,
    icon: "segment",
    component: BreakoutStep,
    priority: 1,
    getColor: () => c("accent4"),
  },
  sort: {
    title: t`Sort`,
    icon: "smartscalar",
    component: SortStep,
    compact: true,
    getColor: () => c("bg-dark"),
  },
  limit: {
    title: t`Row limit`,
    icon: "list",
    component: LimitStep,
    compact: true,
    getColor: () => c("bg-dark"),
  },
};

function getTestId(step) {
  const { type, stageIndex, itemIndex } = step;
  return `step-${type}-${stageIndex || 0}-${itemIndex || 0}`;
}

const CONTENT_WIDTH = [11 / 12, 8 / 12];

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

    const { title, getColor, component: NotebookStepComponent } =
      STEP_UI[step.type] || {};

    const color = getColor();
    const canPreview = step.previewQuery && step.previewQuery.isValid();
    const showPreviewButton = !showPreview && canPreview;

    const largeActionButtons =
      isLastStep &&
      _.any(step.actions, action => !STEP_UI[action.type].compact);

    const actions = [];
    actions.push(
      ...step.actions.map(action => {
        const stepUi = STEP_UI[action.type];

        return {
          priority: stepUi.priority,
          button: (
            <ActionButton
              mr={isLastStep ? 2 : 1}
              mt={isLastStep ? 2 : null}
              color={stepUi.getColor()}
              large={largeActionButtons}
              {...stepUi}
              key={`actionButton_${stepUi.title}`}
              onClick={() => action.action({ query: step.query, openStep })}
            />
          ),
        };
      }),
    );

    actions.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const actionButtons = actions.map(action => action.button);

    return (
      <ExpandingContent isInitiallyOpen={!isLastOpened} isOpen>
        <Box
          mb={[1, 2]}
          pb={[1, 2]}
          className="hover-parent hover--visibility"
          data-testid={getTestId(step)}
        >
          <Flex
            mb={1}
            width={CONTENT_WIDTH}
            className="text-bold"
            style={{ color }}
          >
            {title}
            <Icon
              name="close"
              className="ml-auto cursor-pointer text-light text-medium-hover hover-child"
              tooltip={t`Remove`}
              onClick={() => step.revert(step.query).update(updateQuery)}
              data-testid="remove-step"
            />
          </Flex>

          {NotebookStepComponent && (
            <Flex align="center">
              <Box width={CONTENT_WIDTH}>
                <NotebookStepComponent
                  color={color}
                  step={step}
                  query={step.query}
                  updateQuery={updateQuery}
                  isLastOpened={isLastOpened}
                />
              </Box>
              <Box width={[1 / 12]}>
                <ActionButton
                  ml={[1, 2]}
                  className={
                    !showPreviewButton ? "hidden disabled" : "text-brand-hover"
                  }
                  icon="play"
                  title={t`Preview`}
                  color={c("text-light")}
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

          {actionButtons.length > 0 && (
            <Box mt={1} data-testid="action-buttons">
              {actionButtons}
            </Box>
          )}
        </Box>
      </ExpandingContent>
    );
  }
}

const ColorButton = forwardRefToInnerRef(styled(Button)`
  border: none;
  color: ${({ color }) => (color ? color : c("text-medium"))};
  background-color: ${({ color }) => (color ? lighten(color, 0.61) : null)};
  &:hover {
    color: ${({ color }) => (color ? darken(color, 0.115) : color("brand"))};
    background-color: ${({ color }) =>
      color ? lighten(color, 0.5) : lighten(color("brand"), 0.61)};
  }
  transition: background 300ms;
`);

const ActionButton = ({ icon, title, color, large, onClick, ...props }) => {
  const button = (
    <ColorButton
      color={color}
      icon={icon}
      small={!large}
      iconVertical={large}
      iconSize={large ? 18 : 14}
      onClick={onClick}
      {...props}
    >
      {large ? title : null}
    </ColorButton>
  );

  return large ? button : <Tooltip tooltip={title}>{button}</Tooltip>;
};
