import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Icon, Tooltip } from "metabase/ui";
import {
  type ClickAction,
  isCustomClickAction,
  isCustomClickActionWithView,
} from "metabase/visualizations/types";
import { isRegularClickAction } from "metabase/visualizations/types";

import S from "./ClickActionControl.module.css";

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
        <Button
          variant="outline"
          fz="xl"
          size="xs"
          onClick={handleClick}
          className={S.tokenFilterActionButton}
          leftSection={
            typeof action.icon === "string" && (
              <Icon
                className={S.clickActionButtonIcon}
                name={action.icon}
                m={0}
              />
            )
          }
        >
          {action.title}
        </Button>
      );

    case "token":
      return (
        <Button
          variant="outline"
          size="xs"
          fz="sm"
          className={S.tokenFilterActionTokenButton}
          onClick={handleClick}
        >
          {action.title}
        </Button>
      );

    case "sort":
      return (
        <Tooltip label={action.tooltip}>
          <Button
            variant="outline"
            fz="xl"
            size="xs"
            className={S.tokenFilterActionButton}
            data-testid={`click-actions-sort-control-${action.name}`}
            onClick={handleClick}
          >
            {typeof action.icon === "string" && (
              <Icon size={14} name={action.icon} />
            )}
          </Button>
        </Tooltip>
      );

    case "formatting":
      return (
        <Tooltip label={action.tooltip}>
          <Button variant="outline" fz="xl" size="xs" onClick={handleClick}>
            {typeof action.icon === "string" && (
              <Icon size={16} name={action.icon} />
            )}
          </Button>
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
              <Box className={S.clickActionButtonTextIcon}>
                {action.iconText}
              </Box>
            ) : action.icon ? (
              <Icon
                className={S.clickActionButtonIcon}
                name={action.icon}
                m={0}
              />
            ) : null
          }
          onClick={handleClick}
        >
          {action.title}
          {action.subTitle && <Box>{action.subTitle}</Box>}
        </Button>
      );

    case "info":
      return <Box className={S.infoControl}>{action.title}</Box>;
  }
};
