import { t } from "ttag";

import { currency } from "cljs/metabase.util.currency";
import { Flex, Select, SelectItem, Text } from "metabase/ui";

const DATA = getData();

interface Props {
  className?: string;
  value: string;
  onChange: (value: string) => void;
}

export const CurrencyPicker = ({ className, value, onChange }: Props) => {
  return (
    <Select
      className={className}
      data={DATA}
      nothingFoundMessage={t`Didn't find any results`}
      placeholder={t`Select a currency type`}
      renderOption={item => (
        <SelectItem selected={item.option.value === value}>
          <Flex align="center" flex="1" gap="xs" justify="space-between">
            <span>{item.option.label}</span>

            <Text c={item.checked ? "text-white" : "text-light"}>
              {getSymbol(item.option.value)}
            </Text>
          </Flex>
        </SelectItem>
      )}
      searchable
      value={value}
      onChange={onChange}
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

function getSymbol(code: Currency["code"]): Currency["symbol"] | undefined {
  return DATA.find(item => item.value === code)?.symbol;
}
