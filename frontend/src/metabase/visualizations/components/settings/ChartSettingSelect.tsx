import cx from "classnames";
import { type ReactNode, useContext, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import CS from "metabase/css/core/index.css";
import { Select, type SelectProps } from "metabase/ui";
import { decodeWidgetValue, encodeWidgetValue } from "metabase/viz-core";

import S from "./ChartSettingSelect.module.css";
import { WidgetPopoverPortalContext } from "./WidgetPopoverPortalContext";

export type ChartSettingSelectValue = string | number | boolean | null;

type ChartSettingSelectOption = {
  name: string;
  value: ChartSettingSelectValue;
};

type ChartSettingSelectProps = Pick<
  SelectProps,
  | "className"
  | "defaultDropdownOpened"
  | "id"
  | "leftSection"
  | "leftSectionWidth"
  | "pl"
  | "pr"
  | "rightSection"
  | "variant"
  | "w"
> & {
  footer?: ReactNode;
  hasLeftSection?: boolean;
  icon?: SelectProps["leftSection"];
  iconWidth?: SelectProps["leftSectionWidth"];
  onChange: (value: ChartSettingSelectValue) => void;
  options?: ChartSettingSelectOption[];
  placeholder?: string;
  placeholderNoOptions?: string;
  disabled?: boolean;
  rightSectionWidth?: string;
  searchProp?: string;
  value?: ChartSettingSelectValue;
};

export const ChartSettingSelect = ({
  // Use null if value is undefined. If we pass undefined, Select will create an
  // uncontrolled component because it's wrapped with Uncontrollable.
  className,
  defaultDropdownOpened,
  footer,
  hasLeftSection,
  icon,
  iconWidth,
  id,
  leftSection,
  onChange,
  options = [],
  pl,
  placeholder,
  placeholderNoOptions,
  pr,
  disabled: externallyDisabled,
  rightSection,
  rightSectionWidth,
  searchProp,
  value = null,
  variant,
  w,
}: ChartSettingSelectProps) => {
  const popoverPortal = useContext(WidgetPopoverPortalContext);
  const comboboxProps: SelectProps["comboboxProps"] = popoverPortal
    ? {
        keepMounted: false,
        withinPortal: true,
        portalProps: { target: popoverPortal.dropdownTarget },
      }
    : { withinPortal: false, floatingStrategy: "absolute" };

  const [dropdownOpened, setDropdownOpened] = useState(
    Boolean(defaultDropdownOpened),
  );
  // Mantine's Select has no footer slot, so the footer is portaled into its dropdown element while it is open
  const dropdownId = useId();
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setFooterTarget(
      footer && dropdownOpened ? document.getElementById(dropdownId) : null,
    );
  }, [footer, dropdownOpened, dropdownId]);
  const scrollContainer = popoverPortal?.scrollContainer;
  useEffect(() => {
    if (!scrollContainer || !dropdownOpened) {
      return;
    }
    const close = () => setDropdownOpened(false);
    scrollContainer.addEventListener("scroll", close, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", close);
  }, [scrollContainer, dropdownOpened]);

  const disabled =
    externallyDisabled ||
    options.length === 0 ||
    (options.length === 1 && options[0].value === value);

  const data = options.map(({ name, value }) => ({
    label: name,
    value: encodeWidgetValue(value) || "",
  }));

  const encodedValue = encodeWidgetValue(value);
  const selectedValue = data.some((option) => option.value === encodedValue)
    ? encodedValue
    : null;

  const inputPaddingRight = rightSectionWidth
    ? `${parseInt(rightSectionWidth, 10) + 8}px`
    : undefined;

  const resolvedLeftSection = leftSection ?? icon;

  return (
    <>
      <Select
        px={0}
        id={id}
        data-testid="chart-setting-select"
        className={cx(className, CS.block)}
        attributes={{ dropdown: { id: dropdownId } }}
        classNames={{
          root: S.root,
          wrapper: S.wrapper,
          section: S.section,
          input: cx(S.input, { [S.inputWithLeftSection]: hasLeftSection }),
        }}
        styles={
          externallyDisabled
            ? {
                input: {
                  backgroundColor:
                    "var(--mb-color-background_surface-disabled)",
                  color: "var(--mb-color-text-disabled)",
                },
              }
            : undefined
        }
        data={data}
        disabled={disabled}
        value={selectedValue}
        // Mantine's Select passes two arguments to onChange, but the onChange defined in the settings code takes one.
        onChange={(v) => {
          if (v == null) {
            onChange(null);
            return;
          }
          // the encoded options only ever hold these value types
          onChange(decodeWidgetValue(v) as ChartSettingSelectValue);
        }}
        placeholder={options.length === 0 ? placeholderNoOptions : placeholder}
        searchable={!!searchProp}
        comboboxProps={comboboxProps}
        leftSection={resolvedLeftSection}
        leftSectionWidth={icon != null ? iconWidth : undefined}
        rightSection={rightSection}
        rightSectionProps={
          rightSectionWidth
            ? { style: { width: rightSectionWidth } }
            : undefined
        }
        style={
          inputPaddingRight
            ? {
                "--chart-setting-select-input-padding-right": inputPaddingRight,
              }
            : undefined
        }
        defaultDropdownOpened={
          popoverPortal ? undefined : defaultDropdownOpened
        }
        dropdownOpened={popoverPortal ? dropdownOpened : undefined}
        onDropdownOpen={() => setDropdownOpened(true)}
        onDropdownClose={() => setDropdownOpened(false)}
        pl={pl}
        pr={pr}
        variant={variant}
        w={w}
      />
      {footer && footerTarget && createPortal(footer, footerTarget)}
    </>
  );
};
