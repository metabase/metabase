import { t } from "ttag";

import { SettingsSection } from "metabase/settings-components";
import { Box, Radio, Select, Stack, Text } from "metabase/ui";
import {
  getCurrencyOptions,
  getCurrencyPositionOptions,
  getCurrencyStyleOptions,
  getEffectiveCurrencyPosition,
} from "metabase/utils/formatting";
import type { CurrencyFormattingSettings } from "metabase-types/api";

type Props = {
  value: CurrencyFormattingSettings;
  onChange: (value: CurrencyFormattingSettings) => void;
};

export function CurrencyFormattingSection({ value, onChange }: Props) {
  const { currency, currency_style, currency_position } = value;
  const currencyOptions = getCurrencyOptions().map(({ name, value }) => ({
    label: name,
    value,
  }));
  const styleOptions = getCurrencyStyleOptions(currency, currency_style);
  const positionOptions = getCurrencyPositionOptions();
  const isName = currency_style === "name";

  return (
    <SettingsSection title={t`Currency`}>
      <Box data-testid="currency-formatting-setting">
        <Text
          htmlFor="currency"
          component="label"
          fw="bold"
          display="block"
          mb="xxs"
        >
          {t`Unit of currency`}
        </Text>
        <Select
          id="currency"
          value={currency}
          searchable
          data={currencyOptions}
          onChange={(currency) => {
            if (currency !== null) {
              onChange({ ...value, currency });
            }
          }}
        />
      </Box>
      <Box data-testid="currency_style-formatting-setting">
        <Radio.Group
          label={t`Currency label style`}
          value={currency_style}
          onChange={(currencyStyle) => {
            const option = styleOptions.find(
              ({ value }) => value === currencyStyle,
            );
            if (option) {
              onChange({ ...value, currency_style: option.value });
            }
          }}
        >
          <Stack gap="sm" mt="xxs">
            {styleOptions.map(({ name, value }) => (
              <Radio key={value} value={value} label={name} />
            ))}
          </Stack>
        </Radio.Group>
      </Box>
      <Box data-testid="currency_position-formatting-setting">
        <Radio.Group
          label={t`Currency label position`}
          value={getEffectiveCurrencyPosition(
            currency_style,
            currency_position,
          )}
          description={
            isName
              ? t`Currency names always appear after the amount.`
              : undefined
          }
          onChange={(currencyPosition) => {
            const option = positionOptions.find(
              ({ value }) => value === currencyPosition,
            );
            if (option) {
              onChange({ ...value, currency_position: option.value });
            }
          }}
        >
          <Stack gap="sm" mt="xxs">
            {positionOptions.map(({ name, value }) => (
              <Radio key={value} value={value} label={name} disabled={isName} />
            ))}
          </Stack>
        </Radio.Group>
      </Box>
    </SettingsSection>
  );
}
