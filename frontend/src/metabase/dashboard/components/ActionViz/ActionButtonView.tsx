import { t } from "ttag";

import {
  Button,
  type ButtonColor,
  type ButtonVariant,
  Ellipsified,
  Icon,
} from "metabase/ui";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { IconName } from "metabase-types/api";

import S from "./ActionButton.module.css";

const BUTTON_VARIANT_PROPS: Record<
  string,
  { variant: ButtonVariant; color?: ButtonColor }
> = {
  default: { variant: "default" },
  primary: { variant: "filled" },
  danger: { variant: "filled", color: "negative" },
  success: { variant: "filled", color: "positive" },
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
      bd={focus ? "2px solid var(--mb-color-input-focus)" : undefined}
      variant={buttonVariant}
      color={color}
      disabled={!!disabled}
      onClick={onClick}
      fullWidth
      aria-label={tooltip}
      leftSection={icon ? <Icon name={icon} /> : undefined}
    >
      <Ellipsified>{label ?? t`Click me`}</Ellipsified>
    </Button>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionButtonView;
