import Tooltip from "metabase/core/components/Tooltip";
import { color } from "metabase/lib/colors";
import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";
import {
  type ClickAction,
  type CustomClickAction,
  isCustomClickAction,
  isCustomClickActionWithView,
} from "metabase/visualizations/types";
import { isRegularClickAction } from "metabase/visualizations/types";

import {
  ClickActionButtonIcon,
  ClickActionButtonTextIcon,
  FormattingControl,
  HorizontalClickActionButton,
  InfoControl,
  SortControl,
  TokenActionButton,
  TokenFilterActionButton,
} from "./ClickActionControl.styled";

interface Props {
  action: ClickAction;
  close: () => void;
  onClick: (action: ClickAction) => void;
}

export const ClickActionControl = ({
  action,
  close,
  onClick,
}: Props): JSX.Element | null => {
  if (!isRegularClickAction(action)) {
    return null;
  }

  const handleClick =
    isCustomClickAction(action) && action.onClick
      ? () => (action as CustomClickAction).onClick?.({ closePopover: close })
      : () => onClick(action);

  const { buttonType } = action;

  switch (buttonType) {
    case "token-filter":
      return (
        <TokenFilterActionButton
          small
          icon={
            typeof action.icon === "string" && (
              <ClickActionButtonIcon
                name={action.icon as unknown as IconName}
              />
            )
          }
          onClick={handleClick}
        >
          {action.title}
        </TokenFilterActionButton>
      );

    case "token":
      return (
        <TokenActionButton small onClick={handleClick}>
          {action.title}
        </TokenActionButton>
      );

    case "sort":
      return (
        <Tooltip tooltip={action.tooltip}>
          <SortControl onlyIcon onClick={handleClick}>
            {typeof action.icon === "string" && (
              <Icon size={14} name={action.icon as unknown as IconName} />
            )}
          </SortControl>
        </Tooltip>
      );

    case "formatting":
      return (
        <Tooltip tooltip={action.tooltip}>
          <FormattingControl onlyIcon onClick={handleClick}>
            {typeof action.icon === "string" && (
              <Icon size={16} name={action.icon as unknown as IconName} />
            )}
          </FormattingControl>
        </Tooltip>
      );

    case "horizontal":
      return (
        <HorizontalClickActionButton
          small
          icon={
            action.iconText ? (
              <ClickActionButtonTextIcon>
                {action.iconText}
              </ClickActionButtonTextIcon>
            ) : action.icon ? (
              <ClickActionButtonIcon name={action.icon} />
            ) : null
          }
          iconColor={color("brand")}
          onClick={handleClick}
        >
          {action.title}
        </HorizontalClickActionButton>
      );

    case "info":
      return <InfoControl>{action.title}</InfoControl>;
  }

  if (isCustomClickActionWithView(action)) {
    return action.view({ closePopover: close });
  }

  return null;
};
