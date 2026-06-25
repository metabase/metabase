import { t } from "ttag";

import { Button, Ellipsified, Icon } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { IconName } from "metabase-types/api";

import S from "./ActionButton.module.css";
import { StyledButtonContent } from "./ActionButton.styled";

const BUTTON_VARIANT_PROPS: Record<
  string,
  { variant: string; color?: ColorName }
> = {
  default: { variant: "default" },
  primary: { variant: "filled" },
  danger: { variant: "filled", color: "error" },
  success: { variant: "filled", color: "success" },
  borderless: { variant: "subtle" },
};

interface ActionButtonViewProps extends Pick<VisualizationProps, "settings"> {
  disabled?: boolean;
  icon?: IconName;
  tooltip?: string;
  isFullHeight?: boolean;
  onClick?: () => void;
  focus?: boolean;
}

function ActionButtonView({
  settings,
  disabled,
  icon,
  tooltip,
  isFullHeight = false,
  onClick,
  focus,
}: ActionButtonViewProps) {
  const label = settings["button.label"];
  const variant = settings["button.variant"] ?? "primary";
  const { variant: buttonVariant, color } =
    BUTTON_VARIANT_PROPS[variant] ?? BUTTON_VARIANT_PROPS.primary;

  return (
    <Button
      className={S.actionButton}
      p={0}
      h={isFullHeight ? "100%" : undefined}
      bd={focus ? "2px solid var(--mb-color-focus)" : undefined}
      variant={buttonVariant}
      color={color}
      disabled={!!disabled}
      onClick={onClick}
      fullWidth
      aria-label={tooltip}
    >
      <StyledButtonContent>
        {icon && <Icon name={icon} />}
        <Ellipsified>{label ?? t`Click me`}</Ellipsified>
      </StyledButtonContent>
    </Button>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionButtonView;
