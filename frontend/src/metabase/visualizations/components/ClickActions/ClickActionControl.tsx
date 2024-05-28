import Tooltip from "metabase/core/components/Tooltip";
import type { IconName } from "metabase/ui";
import { Icon, Button } from "metabase/ui";
import {
  type ClickAction,
  type CustomClickAction,
  isCustomClickAction,
  isCustomClickActionWithView,
} from "metabase/visualizations/types";
import { isRegularClickAction } from "metabase/visualizations/types";

import styles from "./ClickActionControl.module.css";
import {
  ClickActionButtonIcon,
  ClickActionButtonTextIcon,
  FormattingControl,
  InfoControl,
  SortControl,
  TokenActionButton,
  TokenFilterActionButton,
  Subtitle,
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
  if (
    !isRegularClickAction(action) &&
    !isCustomClickAction(action) &&
    !isCustomClickActionWithView(action)
  ) {
    return null;
  }

  const handleClick =
    isCustomClickAction(action) && action.onClick
      ? () => (action as CustomClickAction).onClick?.({ closePopover: close })
      : () => onClick(action);

  if (isCustomClickActionWithView(action)) {
    return action.view({ closePopover: close });
  }

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
        <Button
          classNames={{
            root: styles.horizontalButton,
            label: styles.label,
            inner: styles.inner,
          }}
          leftIcon={
            action.iconText ? (
              <ClickActionButtonTextIcon className={styles.nested}>
                {action.iconText}
              </ClickActionButtonTextIcon>
            ) : action.icon ? (
              <ClickActionButtonIcon
                name={action.icon}
                className={styles.nested}
              />
            ) : null
          }
          onClick={handleClick}
        >
          {action.title}
          {action.subTitle && (
            <Subtitle className={styles.nested}>{action.subTitle}</Subtitle>
          )}
        </Button>
      );

    case "info":
      return <InfoControl>{action.title}</InfoControl>;
  }

  return null;
};
