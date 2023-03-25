/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import _ from "underscore";
import styled from "@emotion/styled";

import { color as c, lighten, darken, alpha } from "metabase/lib/colors";

import Tooltip from "metabase/core/components/Tooltip";
import Icon from "metabase/components/Icon";
import Button from "metabase/core/components/Button";
import ExpandingContent from "metabase/components/ExpandingContent";

import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

import NotebookStepPreview from "../NotebookStepPreview";

import { NotebookStep as INotebookStep } from "../lib/steps.types";
import DataStep from "../steps/DataStep";
import JoinStep from "../steps/JoinStep";
import ExpressionStep from "../steps/ExpressionStep";
import FilterStep from "../steps/FilterStep";
import AggregateStep from "../steps/AggregateStep";
import BreakoutStep from "../steps/BreakoutStep";
import SummarizeStep from "../steps/SummarizeStep";
import SortStep from "../steps/SortStep";
import LimitStep from "../steps/LimitStep";
import {
  StepActionsContainer,
  StepBody,
  StepContent,
  StepHeader,
  StepButtonContainer,
  StepRoot,
} from "../NotebookStep.styled";

type StepUIItem = {
  title: string;
  icon?: string;
  priority?: number;
  transparent?: boolean;
  compact?: boolean;
  getColor: () => string;

  // Remove any once all step components are typed
  component: React.ComponentType<any>;
};

// TODO
const STEP_UI: Record<string, StepUIItem> = {
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

function getTestId(step: INotebookStep) {
  const { type, stageIndex, itemIndex } = step;
  return `step-${type}-${stageIndex || 0}-${itemIndex || 0}`;
}

interface NotebookStepProps {
  step: INotebookStep;
  sourceQuestion?: Question;
  isLastStep: boolean;
  isLastOpened: boolean;
  reportTimezone?: string;
  openStep: (id: string) => void;
  updateQuery: (query: StructuredQuery) => Promise<void>;
}

class NotebookStep extends React.Component<NotebookStepProps> {
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
      reportTimezone,
      sourceQuestion,
    } = this.props;
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
              mt={isLastStep ? 2 : undefined}
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
              onClick={() => {
                const reverted = step.revert?.(step.query);
                if (reverted) {
                  updateQuery(reverted);
                }
              }}
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
                  sourceQuestion={sourceQuestion}
                  updateQuery={updateQuery}
                  isLastOpened={isLastOpened}
                  reportTimezone={reportTimezone}
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

interface ColorButtonProps {
  color: string;
  transparent?: boolean;
}

const ColorButton = styled(Button)<ColorButtonProps>`
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

interface ActionButtonProps {
  className?: string;

  icon?: string;
  title: string;
  color: string;
  transparent?: boolean;
  large?: boolean;
  onClick: () => void;

  // styled-system props
  mt?: number | number[];
  mr?: number | number[];
  ml?: number | number[];
}

const ActionButton = ({
  icon,
  title,
  color,
  transparent,
  large,
  onClick,
  ...props
}: ActionButtonProps) => {
  const label = large ? title : undefined;

  const button = (
    <ColorButton
      icon={icon}
      small={!large}
      color={color}
      transparent={transparent}
      iconVertical={large}
      iconSize={large ? 18 : 14}
      onClick={onClick}
      aria-label={label}
      {...props}
    >
      {label}
    </ColorButton>
  );

  return large ? button : <Tooltip tooltip={title}>{button}</Tooltip>;
};

export default NotebookStep;
