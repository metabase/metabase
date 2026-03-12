import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import {
  Box,
  type ComboboxItem,
  Flex,
  Icon,
  Loader,
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
  value: RemappingValue;
  options: RemappingValue[];
  isLoadingFieldValues?: boolean;
  onChange: (value: RemappingValue) => void;
}

export const DisplayValuesPicker = ({
  value,
  options,
  isLoadingFieldValues = false,
  comboboxProps,
  onChange,
  ...props
}: Props) => {
  const data = useMemo(() => getData(options, value), [options, value]);

  const handleChange = (newValue: RemappingValue) => {
    onChange(newValue);
  };

  return (
    <Select
      value={value}
      data={data}
      placeholder={t`Select display values`}
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
      renderOption={({ option, checked }) => {
        const isLoading = getIsOptionLoading(option, isLoadingFieldValues);
        const disableReason = getDisableReason(option, isLoadingFieldValues);

        return (
          <SelectItem
            className={cx({
              [S.disabledItem]: option.disabled,
            })}
            selected={checked}
          >
            <Flex align="center" justify="space-between" w="100%">
              <Text c="inherit" component="span" lh="1rem">
                {option.label}
              </Text>

              {isLoading ? (
                <Loader size="xs" />
              ) : (
                disableReason != null && (
                  <Tooltip label={disableReason} maw={rem(300)}>
                    <Box className={S.infoIconContainer}>
                      <Icon className={S.infoIcon} name="info" />
                    </Box>
                  </Tooltip>
                )
              )}
            </Flex>
          </SelectItem>
        );
      }}
      onChange={handleChange}
      {...props}
    />
  );
};

function getData(options: RemappingValue[], value: RemappingValue) {
  const allOptions = [...options, value];

  return [
    {
      value: "original" as const,
      label: t`Use original value`,
      disabled: !allOptions.includes("original"),
    },
    {
      value: "foreign" as const,
      label: t`Use foreign key`,
      disabled: !allOptions.includes("foreign"),
    },
    {
      value: "custom" as const,
      label: t`Custom mapping`,
      disabled: !allOptions.includes("custom"),
    },
  ];
}

function getIsOptionLoading(
  option: ComboboxItem,
  isLoadingFieldValues: boolean,
) {
  return option.value === "custom" && isLoadingFieldValues;
}

function getDisableReason(option: ComboboxItem, isLoadingFieldValues: boolean) {
  if (!option.disabled) {
    return null;
  }

  switch (option.value) {
    case "foreign":
      return t`You can only use foreign key mapping for fields with the semantic type set to "Foreign Key"`;
    case "custom":
      return !isLoadingFieldValues
        ? t`You can only use custom mapping for numerical fields with filtering set to "A list of all values"`
        : null;
  }
}
