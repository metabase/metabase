import React from "react";
import styled from "@emotion/styled";
import { ClickAction, isRegularClickAction } from "metabase/modes/types";
import Button from "metabase/core/components/Button/Button";
import Tooltip from "metabase/core/components/Tooltip";
import { alpha, color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon/Icon";
import { ClickActionButtonIcon } from "./ChartClickActions.styled";

interface Props {
  action: ClickAction;
  onClick: (action: ClickAction) => void;
}

// buttonType - visual
// url - As Link
const ClickActionControl = ({ action, onClick }: Props): JSX.Element | null => {
  if (!isRegularClickAction(action)) {
    return null;
  }

  const { buttonType } = action;

  switch (buttonType) {
    case "horizontal":
      return (
        <HorizontalClickActionButton
          small
          fullWidth
          icon={
            action.icon && typeof action.icon === "string" ? (
              <ClickActionButtonIcon size={14} name={action.icon} />
            ) : (
              action.icon
            )
          }
          onClick={() => onClick(action)}
        >
          {action.title}
        </HorizontalClickActionButton>
      );

    case "token-filter":
      return (
        <TokenFilterActionButton
          small
          icon={
            action.icon && typeof action.icon === "string" ? (
              <ClickActionButtonIcon size={12} name={action.icon} />
            ) : (
              action.icon
            )
          }
          onClick={() => onClick(action)}
        >
          {action.title}
        </TokenFilterActionButton>
      );

    case "token":
      return (
        <TokenActionButton small onClick={() => onClick(action)}>
          {action.title}
        </TokenActionButton>
      );

    case "sort":
      return (
        <Tooltip tooltip={action.tooltip}>
          <SortControl
            // className={"flex flex-row align-center"}
            onClick={() => onClick(action)}
          >
            {action.icon && <SortIcon size={12} name={action.icon} />}
          </SortControl>
        </Tooltip>
      );

    case "formatting":
      return (
        <Tooltip tooltip={action.tooltip}>
          <FormattingControl
            // className={"flex flex-row align-center"}
            onClick={() => onClick(action)}
          >
            {action.icon && <FormattingIcon size={16} name={action.icon} />}
          </FormattingControl>
        </Tooltip>
      );

    default: {
      return <>{action.title}</>;
    }
  }

  return null;
};

export default ClickActionControl;

const HorizontalClickActionButton = styled(Button)`
  display: flex;
  flex: auto;
  align-items: center;

  border-radius: 8px;
  border: none;

  padding: 0.5rem;

  line-height: 1rem;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};

    ${ClickActionButtonIcon} {
      color: ${color("white")};
    }
  }
`;

const TokenFilterActionButton = styled(Button)`
  color: ${color("brand")};
  font-size: 1.25rem;
  line-height: 1rem;
  padding: 0.125rem 0.85rem 0.25rem;
  border: 1px solid ${color("focus")};
  border-radius: 100px;
  margin-right: 0.75rem;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
    border-color: ${color("brand")};
  }
`;

const TokenActionButton = styled(Button)`
  color: ${color("brand")};
  font-size: 0.875em;
  line-height: 1rem;
  margin-right: 0.5rem;
  padding: 0.3125rem 0.875rem;
  border: 1px solid ${alpha("brand", 0.35)};
  border-radius: 100px;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;

const SortControl = styled(Button)`
  color: ${color("brand")};
  border: 1px solid ${alpha("brand", 0.35)};
  margin-right: 0.5rem;

  &:hover {
    background-color: ${color("brand")};
  }
`;

const FormattingControl = styled(Button)`
  color: ${alpha("text-light", 0.65)};
  margin-left: auto;

  &:hover {
    color: ${color("brand")};
  }
`;

const SortIcon = styled(Icon)`
  color: ${color("brand")};

  &:hover {
    color: ${color("white")};
  }

  margin-right: 0.5rem;
`;

const FormattingIcon = styled(Icon)`
  margin-right: 0.5rem;
`;
