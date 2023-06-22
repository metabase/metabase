import { t } from "ttag";

import Ellipsified from "metabase/core/components/Ellipsified";
import { Icon, IconName } from "metabase/core/components/Icon";
import type { VisualizationProps } from "metabase/visualizations/types";

import { StyledButton, StyledButtonContent } from "./ActionButton.styled";

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
  isFullHeight,
  onClick,
  focus,
}: ActionButtonViewProps) {
  const label = settings["button.label"];
  const variant = settings["button.variant"] ?? "primary";

  const variantProps: any = {};
  if (variant !== "default") {
    variantProps[variant] = true;
  }

  return (
    <StyledButton
      disabled={!!disabled}
      onClick={onClick}
      fullWidth
      isFullHeight={isFullHeight}
      focus={focus}
      aria-label={tooltip}
      {...variantProps}
    >
      <StyledButtonContent>
        {icon && <Icon name={icon} />}
        <Ellipsified>{label ?? t`Click me`}</Ellipsified>
      </StyledButtonContent>
    </StyledButton>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionButtonView;
