import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import {
  Box,
  type ComboboxItem,
  Flex,
  Icon,
  Select,
  SelectItem,
  type SelectProps,
  Text,
  Tooltip,
  rem,
} from "metabase/ui";

import S from "./DisplayValuesPicker.module.css";
import type { RemappingValue } from "./types";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  options: RemappingValue[];
  value: RemappingValue;
  onChange: (value: RemappingValue) => void;
}

export const DisplayValuesPicker = ({
  comboboxProps,
  options,
  value,
  onChange,
  ...props
}: Props) => {
  const data = useMemo(() => getData(options, value), [options, value]);

  const handleChange = (value: string) => {
    const newValue = value as RemappingValue;
    onChange(newValue);
  };

  return (
    <Select
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
        position: "bottom-start",
        ...comboboxProps,
      }}
      data={data}
      placeholder={t`Select display values`}
      renderOption={(item) => {
        const disabledReason = hasDisabledReason(item.option)
          ? item.option.disabledReason
          : undefined;

        return (
          <SelectItem
            className={cx({
              [S.disabledItem]: item.option.disabled,
            })}
            selected={item.checked}
          >
            <Flex align="center" justify="space-between" w="100%">
              <Text c="inherit" component="span" lh="1rem">
                {item.option.label}
              </Text>

              {item.option.disabled && disabledReason && (
                <Tooltip label={disabledReason} maw={rem(300)}>
                  <Box className={S.infoIconContainer}>
                    <Icon className={S.infoIcon} name="info" />
                  </Box>
                </Tooltip>
              )}
            </Flex>
          </SelectItem>
        );
      }}
      value={value}
      onChange={handleChange}
      {...props}
    />
  );
};

function getData(options: RemappingValue[], value: RemappingValue) {
  const allOptions = [...options, value];

  return [
    {
      disabled: !allOptions.includes("original"),
      label: t`Use original value`,
      value: "original",
    },
    {
      disabled: !allOptions.includes("foreign"),
      disabledReason: t`You can only use foreign key mapping for fields with the semantic type set to "Foreign Key"`,
      label: t`Use foreign key`,
      value: "foreign",
    },
    {
      disabled: !allOptions.includes("custom"),
      disabledReason: t`You can only use custom mapping for numerical fields with filtering set to "A list of all values"`,
      label: t`Custom mapping`,
      value: "custom",
    },
  ];
}

function hasDisabledReason(
  item: ComboboxItem,
): item is ComboboxItem & { disabledReason: string } {
  return "disabledReason" in item && typeof item.disabledReason === "string";
}
