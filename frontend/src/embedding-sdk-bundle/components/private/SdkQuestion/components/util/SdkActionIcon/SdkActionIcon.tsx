import cx from "classnames";
import { type ReactElement, forwardRef } from "react";

import type { IconName } from "metabase/embedding-sdk/types/icon";
import {
  ActionIcon,
  type ActionIconProps,
  Icon,
  type PolymorphicComponentProps,
  Tooltip,
} from "metabase/ui";

import S from "./SdkActionIcon.module.css";

type OwnSdkActionIconProps = {
  icon: IconName;
  active?: boolean;
  "data-testid"?: string;
} & (
  | {
      tooltipAriaLabel: string;
      tooltip?: ReactElement;
    }
  | {
      // When tooltip is a string, use it as both the label and aria-label, so we don't need to provide the same string twice.
      tooltipAriaLabel?: string;
      tooltip: string;
    }
);

export const SdkActionIcon = forwardRef<
  HTMLButtonElement,
  PolymorphicComponentProps<"button", ActionIconProps> & OwnSdkActionIconProps
>(function SdkActionIcon(
  {
    icon,
    "data-testid": dataTestId,
    tooltip,
    tooltipAriaLabel,
    active,
    className,
    ...actionIconProps
  },
  ref,
) {
  return (
    <Tooltip label={tooltip} aria-label={tooltipAriaLabel} disabled={!tooltip}>
      <ActionIcon
        ref={ref}
        data-testid={dataTestId}
        data-active={active}
        aria-label={
          tooltipAriaLabel ??
          (typeof tooltip === "string" ? tooltip : undefined)
        }
        size="lg"
        className={cx(S.sdkActionIcon, className)}
        variant="default"
        {...actionIconProps}
      >
        <Icon name={icon} />
      </ActionIcon>
    </Tooltip>
  );
});
