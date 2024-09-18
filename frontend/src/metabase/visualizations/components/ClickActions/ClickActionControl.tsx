import { useTopDbFields } from "metabase/common/hooks";
import Tooltip from "metabase/core/components/Tooltip";
import type { IconName } from "metabase/ui";
import { Button, Icon } from "metabase/ui";
import {
  type ClickAction,
  type CustomClickAction,
  isCustomClickAction,
  isCustomClickActionWithView,
} from "metabase/visualizations/types";
import { isRegularClickAction } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";

import styles from "./ClickActionControl.module.css";
import {
  ClickActionButtonIcon,
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
  const topDbFields = useTopDbFields(__MLv2_query, -1, "field_usage_filter");

  const suggestion = topDbFields.find(field =>
    Lib.isEqual(field.column, action.column),
  );

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
        <span>
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
          {action.name === "column-filter" &&
            !!suggestion?.field_usage_filter_most_used_args && (
              <Button
                w="fit-content"
                py="4px"
                px="8px"
                fz="12px"
                ml="24px"
                fw={600}
                radius={100}
                style={{
                  background:
                    "linear-gradient(80.24deg, #66A5EF 34.6%, #AA97F1 90.52%)",
                  color: "white",
                }}
                leftIcon={<Icon name="sparkles" size="12px" />}
              >{`${suggestion.field_usage_filter_most_used_op} ${suggestion.field_usage_filter_most_used_args?.join(" and ")}`}</Button>
            )}
        </span>
      );

    case "info":
      return <InfoControl>{action.title}</InfoControl>;
  }

  return null;
};
