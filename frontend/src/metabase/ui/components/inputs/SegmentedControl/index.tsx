import type { SegmentedControlProps as MantineSegmentedControlProps } from "@mantine/core";
import { SegmentedControl as MantineSegmentedControl } from "@mantine/core";
import type { ReactElement } from "react";

import type { IconName } from "metabase-types/api";

import { Icon } from "../../icons";

import S from "./SegmentedControl.module.css";

export { segmentedControlOverrides } from "./SegmentedControl.config";

const LABELLED_ICON_SIZE = 12;
const ICON_ONLY_SIZE = 16;

type SegmentedControlIcon = IconName | ReactElement;

type SegmentedControlItemContent =
  | { label: string; icon?: SegmentedControlIcon; ariaLabel?: never }
  | { ariaLabel: string; icon: SegmentedControlIcon; label?: never };

export type SegmentedControlItem<Value extends string> = {
  value: Value;
  disabled?: boolean;
} & SegmentedControlItemContent;

export interface SegmentedControlProps<Value extends string> extends Omit<
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
> {
  data: readonly SegmentedControlItem<Value>[];
  value?: Value;
  onChange?: (value: Value) => void;
}

export function SegmentedControl<Value extends string = string>({
  data,
  onChange,
  ...props
}: SegmentedControlProps<Value>) {
  const handleChange = (newValue: string) => {
    const item = data.find((item) => item.value === newValue);
    if (item) {
      onChange?.(item.value);
    }
  };

  return (
    <MantineSegmentedControl
      {...props}
      data={data.map((item) => ({
        value: item.value,
        disabled: item.disabled,
        label: <SegmentedControlItemLabel content={item} />,
      }))}
      onChange={handleChange}
    />
  );
}

interface SegmentedControlItemLabelProps {
  content: SegmentedControlItemContent;
}

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

interface SegmentedControlItemIconProps {
  icon: SegmentedControlIcon;
  size: number;
  ariaLabel?: string;
}

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
