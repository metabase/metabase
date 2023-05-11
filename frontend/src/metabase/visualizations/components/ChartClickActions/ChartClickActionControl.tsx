import React from "react";
import { ClickAction, isRegularClickAction } from "metabase/modes/types";
import Tooltip from "metabase/core/components/Tooltip";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon/Icon";
import {
  ClickActionButtonIcon,
  FormattingControl,
  HorizontalClickActionButton,
  IconWrapper,
  SortControl,
  TokenActionButton,
  TokenFilterActionButton,
} from "./ChartClickActionControl.styled";

interface Props {
  action: ClickAction;
  onClick: (action: ClickAction) => void;
}

export const ChartClickActionControl = ({
  action,
  onClick,
}: Props): JSX.Element | null => {
  if (!isRegularClickAction(action)) {
    return null;
  }

  const { buttonType } = action;

  switch (buttonType) {
    case "token-filter":
      return (
        <TokenFilterActionButton
          small
          icon={
            typeof action.icon === "string" && (
              <ClickActionButtonIcon size={12} name={action.icon} />
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
          <SortControl onlyIcon onClick={() => onClick(action)}>
            {typeof action.icon === "string" && (
              <Icon size={12} name={action.icon} />
            )}
          </SortControl>
        </Tooltip>
      );

    case "formatting":
      return (
        <Tooltip tooltip={action.tooltip}>
          <FormattingControl onlyIcon onClick={() => onClick(action)}>
            {typeof action.icon === "string" && (
              <Icon size={16} name={action.icon} />
            )}
          </FormattingControl>
        </Tooltip>
      );

    case "horizontal":
    default: {
      return (
        <HorizontalClickActionButton
          small
          icon={
            typeof action.icon === "string" ? (
              <ClickActionButtonIcon size={14} name={action.icon} />
            ) : (
              <IconWrapper>{action.icon}</IconWrapper>
            )
          }
          iconColor={color("brand")}
          onClick={() => onClick(action)}
        >
          {action.title}
        </HorizontalClickActionButton>
      );
    }
  }
};
