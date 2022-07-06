/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";
import _ from "underscore";

import styled from "@emotion/styled";

import { color as c, lighten, darken, alpha } from "metabase/lib/colors";

import Tooltip from "metabase/components/Tooltip";
import Icon from "metabase/components/Icon";
import Button from "metabase/core/components/Button";
import ExpandingContent from "metabase/components/ExpandingContent";

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
import {
  StepActionsContainer,
  StepBody,
  StepContent,
  StepHeader,
  StepButtonContainer,
  StepRoot,
} from "./NotebookStep.styled";

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
    transparent: true,
    getColor: () => c("bg-dark"),
  },
  filter: {
    title: t`Filter`,
    icon: "filter",
    component: FilterStep,
    priority: 10,
    getColor: () => c("filter"),
  },
  summarize: {
    title: t`Summarize`,
    icon: "sum",
    component: SummarizeStep,
    priority: 5,
    getColor: () => c("summarize"),
  },
  aggregate: {
    title: t`Aggregate`,
    icon: "sum",
    component: AggregateStep,
    priority: 5,
    getColor: () => c("summarize"),
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
    transparent: true,
    getColor: () => c("bg-dark"),
  },
  limit: {
    title: t`Row limit`,
    icon: "list",
    component: LimitStep,
    compact: true,
    transparent: true,
    getColor: () => c("bg-dark"),
  },
};

function getTestId(step) {
  const { type, stageIndex, itemIndex } = step;
  return `step-${type}-${stageIndex || 0}-${itemIndex || 0}`;
}

export default class NotebookStep extends React.Component {
  state = {
    showPreview: false,
  };

  render() {
    const { step, openStep, isLastStep, isLastOpened, updateQuery } =
      this.props;
    const { showPreview } = this.state;

    const {
      title,
      getColor,
      component: NotebookStepComponent,
    } = STEP_UI[step.type] || {};

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
        <StepRoot
          className="hover-parent hover--visibility"
          data-testid={getTestId(step)}
        >
          <StepHeader color={color}>
            {title}
            <Icon
              name="close"
              className="ml-auto cursor-pointer text-light text-medium-hover hover-child"
              tooltip={t`Remove`}
              onClick={() => step.revert(step.query).update(updateQuery)}
              data-testid="remove-step"
            />
          </StepHeader>

          {NotebookStepComponent && (
            <StepBody>
              <StepContent>
                <NotebookStepComponent
                  color={color}
                  step={step}
                  query={step.query}
                  updateQuery={updateQuery}
                  isLastOpened={isLastOpened}
                />
              </StepContent>
              <StepButtonContainer>
                <ActionButton
                  ml={[1, 2]}
                  className={
                    !showPreviewButton ? "hidden disabled" : "text-brand-hover"
                  }
                  icon="play"
                  title={t`Preview`}
                  color={c("text-light")}
                  transparent
                  onClick={() => this.setState({ showPreview: true })}
                />
              </StepButtonContainer>
            </StepBody>
          )}

          {showPreview && canPreview && (
            <NotebookStepPreview
              step={step}
              onClose={() => this.setState({ showPreview: false })}
            />
          )}

          {actionButtons.length > 0 && (
            <StepActionsContainer data-testid="action-buttons">
              {actionButtons}
            </StepActionsContainer>
          )}
        </StepRoot>
      </ExpandingContent>
    );
  }
}

const ColorButton = styled(Button)`
  border: none;
  color: ${({ color }) => color};
  background-color: ${({ color, transparent }) =>
    transparent ? null : alpha(color, 0.2)};
  &:hover {
    color: ${({ color }) => darken(color, 0.115)};
    background-color: ${({ color, transparent }) =>
      transparent ? lighten(color, 0.5) : alpha(color, 0.35)};
  }
  transition: background 300ms;
`;

const ActionButton = ({
  icon,
  title,
  color,
  transparent,
  large,
  onClick,
  ...props
}) => {
  const button = (
    <ColorButton
      icon={icon}
      small={!large}
      color={color}
      transparent={transparent}
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
