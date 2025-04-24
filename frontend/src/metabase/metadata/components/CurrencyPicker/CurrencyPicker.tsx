import { t } from "ttag";

import { currency } from "cljs/metabase.util.currency";
import {
  Combobox,
  Flex,
  Icon,
  Select,
  SelectItem,
  type SelectProps,
  Text,
} from "metabase/ui";

import S from "./CurrencyPicker.module.css";

const DATA = getData();
const SYMBOLS = getSymbols();

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
}

export const CurrencyPicker = ({ value, onChange, ...props }: Props) => {
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
        width: 300,
      }}
      data={DATA}
      fw="bold"
      nothingFoundMessage={t`Didn't find any results`}
      placeholder={t`Select a currency type`}
      renderOption={(item) => {
        const selected = item.option.value === value;

        return (
          <SelectItem selected={selected}>
            <Icon name={selected ? "check" : "empty"} />

            <Flex align="center" flex="1" gap="xs" justify="space-between">
              <span>{item.option.label}</span>

              <Text
                c="text-light"
                className={S.symbol}
                flex="0 0 auto"
                lh="1rem"
              >
                {SYMBOLS[item.option.value]}
              </Text>
            </Flex>
          </SelectItem>
        );
      }}
      rightSection={
        <Flex align="center" gap="xs" pos="relative">
          <Text
            bg="var(--input-bg)"
            c="text-light"
            pos="absolute"
            px="sm"
            right="100%"
          >
            {SYMBOLS[value]}
          </Text>

          <Combobox.Chevron />
        </Flex>
      }
      searchable
      value={value}
      onChange={onChange}
      {...props}
    />
  );
};

type Currency = {
  name: string;
  code: string;
  symbol: string;
};

function getData() {
  const currencyData = currency as [Currency["symbol"], Currency][];

  return currencyData.map(([, currency]) => ({
    label: currency.name,
    value: currency.code,
    symbol: currency.symbol,
  }));
}

function getSymbols() {
  return Object.fromEntries(getData().map((item) => [item.value, item.symbol]));
}
