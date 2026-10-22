import type { SegmentedControlProps as MantineSegmentedControlProps } from "@mantine/core";
import { SegmentedControl as MantineSegmentedControl } from "@mantine/core";
import type { FocusEvent, KeyboardEvent, ReactElement, Ref } from "react";

import type { IconName } from "metabase-types/api";

import { useIsTruncated } from "../../../hooks/use-is-truncated";
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
    const { onMouseEnter, onMouseLeave, opened } = tooltip.getTargetProps(
      item.value,
    );
    return {
      value: item.value,
      disabled: item.disabled,
      label: (
        <SegmentedControlItemBody
          content={item}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          opened={opened}
        />
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
      onKeyDown={handleKeyDown}
    />
  );
}

type SegmentedControlItemBodyProps = {
  content: SegmentedControlItemContent;
  opened: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

function SegmentedControlItemBody({
  content,
  opened,
  onMouseEnter,
  onMouseLeave,
}: SegmentedControlItemBodyProps) {
  const hasLabel = content.label !== undefined;
  const { ref: labelTextRef, isTruncated } = useIsTruncated<HTMLSpanElement>({
    disabled: !hasLabel,
    ignoreHeightTruncation: true,
  });
  const hasTooltip = hasLabel ? isTruncated : (content.withTooltip ?? false);

  return (
    <Tooltip
      label={content.label ?? content.ariaLabel}
      opened={hasTooltip && opened}
      disabled={!hasTooltip}
    >
      <span
        className={S.SegmentedControlItemBody}
        // The tooltip repeats the accessible name, so it mustn't also describe it.
        aria-describedby={undefined}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {hasLabel ? (
          <>
            {content.icon !== undefined && (
              <SegmentedControlItemIcon
                icon={content.icon}
                size={LABELLED_ICON_SIZE}
              />
            )}
            <SegmentedControlItemLabelText
              label={content.label}
              textRef={labelTextRef}
            />
          </>
        ) : (
          <SegmentedControlItemIcon
            icon={content.icon}
            size={ICON_ONLY_SIZE}
            ariaLabel={content.ariaLabel}
          />
        )}
      </span>
    </Tooltip>
  );
}

type SegmentedControlItemLabelTextProps = {
  label: string;
  textRef: Ref<HTMLSpanElement>;
};

function SegmentedControlItemLabelText({
  label,
  textRef,
}: SegmentedControlItemLabelTextProps) {
  return (
    <span className={S.SegmentedControlLabelText}>
      <span ref={textRef} className={S.SegmentedControlLabelTextVisible}>
        {label}
      </span>
      {/* Gives the segment its width, see the CSS. Its text comes from CSS, so the label isn't in the DOM twice. */}
      <span
        className={S.SegmentedControlLabelTextSizer}
        data-label={label}
        aria-hidden
      />
    </span>
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
