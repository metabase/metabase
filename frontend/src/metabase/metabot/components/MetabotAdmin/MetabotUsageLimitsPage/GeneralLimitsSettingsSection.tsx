import { useMemo, useState } from "react";
import { c, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  SegmentedControl,
  type SegmentedControlItem,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type { MetabotLimitPeriod, MetabotLimitType } from "metabase-types/api";

import S from "./GeneralLimitsSettingsSection.module.css";

type LimitTypeOption = SegmentedControlItem<MetabotLimitType>;
type PeriodOption = SegmentedControlItem<MetabotLimitPeriod>;

export function GeneralLimitsSettingsSection() {
  const [limitType, setLimitType] = useState<MetabotLimitType>("token");
  const [limitPeriod, setLimitPeriod] = useState<MetabotLimitPeriod>("monthly");

  const limitTypeOptions: LimitTypeOption[] = useMemo(() => {
    return [
      { value: "token", label: t`By token usage` },
      { value: "conversation", label: t`By conversation count` },
      { value: "dollar", label: t`By dollar amount` },
    ];
  }, []);
  const resetPeriodOptions: PeriodOption[] = useMemo(() => {
    return [
      { value: "daily", label: t`Daily` },
      { value: "weekly", label: t`Weekly` },
      { value: "monthly", label: t`Monthly` },
    ];
  }, []);
  const limitLabel: string = useMemo(() => {
    const selectedOption = resetPeriodOptions.find(
      (option) => option.value === limitPeriod,
    );
    return String(selectedOption?.label || t`Monthly`);
  }, [limitPeriod, resetPeriodOptions]);

  return (
    <SettingsSection title={t`Settings and general limits`}>
      <Stack gap="xl" align="flex-start">
        <Stack gap="sm">
          <Text fw="bold">{t`How do you want to limit AI usage?`}</Text>
          <SegmentedControl
            data={limitTypeOptions}
            classNames={{
              root: S.SegmentedControlRoot,
              label: S.Label,
            }}
            value={limitType}
            onChange={setLimitType}
          />
        </Stack>
        <Stack gap="sm">
          <Text fw="bold">{t`When should usage limits reset?`}</Text>
          <SegmentedControl
            data={resetPeriodOptions}
            classNames={{
              root: S.SegmentedControlRoot,
              label: S.Label,
            }}
            value={limitPeriod}
            onChange={setLimitPeriod}
          />
        </Stack>
        <TextInput
          label={c(
            "{0} indicates the limit reset period, e.g., daily, weekly, monthly",
          ).t`Total ${limitLabel.toLowerCase()} instance token limit`}
          description={t`This is the maximum amount all users should be able to use in total.`}
          placeholder={t`Unlimited`}
          classNames={{
            input: S.InstanceTokenLimitInput,
            description: S.InputDescription,
          }}
          type="number"
          min={1}
        />
        <TextInput
          label={t`Quota-reached message`}
          description={t`The message shown to users when if they reach their monthly quota.`}
          placeholder={t`You’ve reached your limit for the month.`}
          classNames={{
            input: S.QuotaMessageInput,
            description: S.InputDescription,
          }}
        />
      </Stack>
    </SettingsSection>
  );
}
