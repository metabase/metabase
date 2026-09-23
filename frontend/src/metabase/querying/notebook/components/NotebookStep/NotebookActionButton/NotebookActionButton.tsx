import cx from "classnames";

import { Box, Flex, Icon, Tooltip, UnstyledButton } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName } from "metabase-types/api";

import S from "./NotebookActionButton.module.css";

interface NotebookActionButtonProps {
  className?: string;
  icon?: IconName;
  title: string;
  color: ColorName;
  secondary?: boolean;
  large?: boolean;
  disabled?: boolean;
  disabledTooltip?: string;
  onClick: () => void;
}

export function NotebookActionButton({
  className,
  icon,
  title,
  color,
  secondary,
  large,
  disabled,
  disabledTooltip,
  onClick,
  ...props
}: NotebookActionButtonProps) {
  const label = large ? title : undefined;
  const tooltip = disabled ? disabledTooltip : large ? undefined : title;

  const button = (
    <UnstyledButton
      className={cx(
        S.ColorButton,
        {
          [S.secondary]: secondary,
          [S.large]: large,
          [S.small]: !large,
        },
        className,
      )}
      aria-label={label}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{
        "--notebook-action-button-color": `var(--mb-color-${color})`,
      }}
      {...props}
    >
      {large ? (
        <Flex direction="column" align="center" miw="60px">
          {icon && <Icon name={icon} size={20} />}
          {label && <span className={S.label}>{label}</span>}
        </Flex>
      ) : (
        icon && <Icon name={icon} size={16} />
      )}
    </UnstyledButton>
  );

  if (!tooltip) {
    return button;
  }

  return (
    <Tooltip label={tooltip}>
      <Box
        component="span"
        display="inline-flex"
        data-testid={disabled ? "disabled-notebook-action" : undefined}
      >
        {button}
      </Box>
    </Tooltip>
  );
}
