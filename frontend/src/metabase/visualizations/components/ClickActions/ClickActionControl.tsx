import { useDispatch } from "metabase/lib/redux";
import { Button, Icon, Tooltip } from "metabase/ui";
import {
  type ClickAction,
  isCustomClickAction,
  isCustomClickActionWithView,
} from "metabase/visualizations/types";
import { isRegularClickAction } from "metabase/visualizations/types";

import S from "./ClickActionControl.module.css";
import {
  ClickActionButtonTextIcon,
  FormattingControl,
  InfoControl,
  SortControl,
  Subtitle,
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
  const dispatch = useDispatch();

  if (
    !isRegularClickAction(action) &&
    !isCustomClickAction(action) &&
    !isCustomClickActionWithView(action)
  ) {
    return null;
  }

  const handleClick =
    isCustomClickAction(action) && action.onClick
      ? () =>
          action.onClick?.({
            dispatch,
            closePopover: close,
          })
      : () => onClick(action);

  if (isCustomClickActionWithView(action)) {
    return action.view({ dispatch, closePopover: close });
  }

  const { buttonType } = action;

  switch (buttonType) {
    case "token-filter":
      return (
        <TokenFilterActionButton
          small
          icon={
            typeof action.icon === "string" && (
              <Icon className={S.ClickActionButtonIcon} name={action.icon} />
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
        <Tooltip label={action.tooltip}>
          <SortControl
            onlyIcon
            onClick={handleClick}
            data-testid={`click-actions-sort-control-${action.name}`}
          >
            {typeof action.icon === "string" && (
              <Icon size={14} name={action.icon} />
            )}
          </SortControl>
        </Tooltip>
      );

    case "formatting":
      return (
        <Tooltip label={action.tooltip}>
          <FormattingControl onlyIcon onClick={handleClick}>
            {typeof action.icon === "string" && (
              <Icon size={16} name={action.icon} />
            )}
          </FormattingControl>
        </Tooltip>
      );

    case "horizontal":
      return (
        <Button
          size="xs"
          p="0.5rem"
          mx="-0.5rem"
          variant="inverse"
          classNames={{
            root: S.horizontalButton,
            label: S.label,
            inner: S.inner,
          }}
          leftSection={
            action.iconText ? (
              <ClickActionButtonTextIcon>
                {action.iconText}
              </ClickActionButtonTextIcon>
            ) : action.icon ? (
              <Icon className={S.ClickActionButtonIcon} name={action.icon} />
            ) : null
          }
          onClick={handleClick}
        >
          {action.title}
          {action.subTitle && (
            <Subtitle className={S.nested}>{action.subTitle}</Subtitle>
          )}
        </Button>
      );

    case "info":
      return <InfoControl>{action.title}</InfoControl>;
  }
};
