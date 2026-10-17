import type { SegmentedControlProps as MantineSegmentedControlProps } from "@mantine/core";
import { SegmentedControl as MantineSegmentedControl } from "@mantine/core";
import type { FocusEvent, KeyboardEvent, ReactElement, ReactNode } from "react";

import type { IconName } from "metabase-types/api";

import { Icon } from "../../icons";
import { Tooltip } from "../../overlays/Tooltip";

import S from "./SegmentedControl.module.css";
import { useItemTooltip } from "./use-item-tooltip";

export { segmentedControlOverrides } from "./SegmentedControl.config";

const LABELLED_ICON_SIZE = 12;
const ICON_ONLY_SIZE = 16;

type SegmentedControlIcon = IconName | ReactElement;

type SegmentedControlItemContent =
  | {
      label: string;
      icon?: SegmentedControlIcon;
      ariaLabel?: never;
      withTooltip?: never;
    }
  | {
      ariaLabel: string;
      icon: SegmentedControlIcon;
      label?: never;
      /** Shows `ariaLabel` as a tooltip on hover and keyboard focus. */
      withTooltip?: boolean;
    };

export type SegmentedControlItem<Value extends string> = {
  value: Value;
  disabled?: boolean;
} & SegmentedControlItemContent;

export type SegmentedControlProps<Value extends string> = Omit<
  MantineSegmentedControlProps,
  | "data"
  | "value"
  | "onChange"
  | "c"
  | "color"
  | "size"
  | "radius"
  | "bg"
  | "variant"
  | "autoContrast"
> & {
  data: readonly SegmentedControlItem<Value>[];
  value?: Value;
  onChange?: (value: Value) => void;
};

export function SegmentedControl<Value extends string = string>({
  data,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: SegmentedControlProps<Value>) {
  const tooltip = useItemTooltip(data);

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    onFocus?.(event);
    tooltip.handleFocus(event);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    onBlur?.(event);
    tooltip.handleBlur();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    tooltip.handleKeyDown(event);
  };

  const handleChange = (newValue: string) => {
    const item = data.find((item) => item.value === newValue);
    if (item) {
      onChange?.(item.value);
    }
  };

  const items = data.map((item) => {
    const label = <SegmentedControlItemLabel content={item} />;

    return {
      value: item.value,
      disabled: item.disabled,
      label: item.withTooltip ? (
        <SegmentedControlItemTooltip
          label={item.ariaLabel}
          {...tooltip.getTargetProps(item.value)}
        >
          {label}
        </SegmentedControlItemTooltip>
      ) : (
        label
      ),
    };
  });

  return (
    <MantineSegmentedControl
      {...props}
      data={items}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={tooltip.hasTooltipItems ? handleKeyDown : onKeyDown}
    />
  );
}

type SegmentedControlItemTooltipProps = {
  label: string;
  opened: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  children: ReactNode;
};

function SegmentedControlItemTooltip({
  label,
  opened,
  onMouseEnter,
  onMouseLeave,
  children,
}: SegmentedControlItemTooltipProps) {
  return (
    <Tooltip label={label} opened={opened}>
      <span
        className={S.SegmentedControlTooltipTarget}
        // The tooltip repeats the accessible name, so it mustn't also describe it.
        aria-describedby={undefined}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </span>
    </Tooltip>
  );
}

type SegmentedControlItemLabelProps = {
  content: SegmentedControlItemContent;
};

function SegmentedControlItemLabel({
  content,
}: SegmentedControlItemLabelProps) {
  if (content.label === undefined) {
    return (
      <SegmentedControlItemIcon
        icon={content.icon}
        size={ICON_ONLY_SIZE}
        ariaLabel={content.ariaLabel}
      />
    );
  }

  return (
    <>
      {content.icon !== undefined && (
        <SegmentedControlItemIcon
          icon={content.icon}
          size={LABELLED_ICON_SIZE}
        />
      )}
      {content.label}
    </>
  );
}

type SegmentedControlItemIconProps = {
  icon: SegmentedControlIcon;
  size: number;
  ariaLabel?: string;
};

function SegmentedControlItemIcon({
  icon,
  size,
  ariaLabel,
}: SegmentedControlItemIconProps) {
  // Next to a visible label the icon is decorative: the label names the item.
  const isDecorative = ariaLabel === undefined;
  const ariaHidden = isDecorative ? true : undefined;

  if (typeof icon === "string") {
    return (
      <Icon
        name={icon}
        size={size}
        aria-label={ariaLabel}
        aria-hidden={ariaHidden}
      />
    );
  }

  return (
    <span
      className={S.SegmentedControlIconElement}
      role={isDecorative ? undefined : "img"}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
    >
      {icon}
    </span>
  );
}
