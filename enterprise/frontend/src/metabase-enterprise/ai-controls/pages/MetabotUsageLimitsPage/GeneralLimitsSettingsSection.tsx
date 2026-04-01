import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  useGetMetabotInstanceLimitQuery,
  useUpdateMetabotInstanceLimitMutation,
} from "metabase/api";
import { useAdminSetting } from "metabase/api/utils";
import { useMetadataToasts } from "metabase/metadata/hooks";
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

const SAVE_DEBOUNCE_MS = 500;

export function GeneralLimitsSettingsSection() {
  // Settings
  const { value: savedLimitType, updateSetting: updateLimitTypeSetting } =
    useAdminSetting("metabot-limit-type");
  const { value: savedLimitPeriod, updateSetting: updateLimitPeriodSetting } =
    useAdminSetting("metabot-limit-reset-rate");
  const { value: savedQuotaMessage, updateSetting: updateQuotaMessageSetting } =
    useAdminSetting("metabot-quota-reached-message");

  // Instance limit
  const { data: instanceLimitData } = useGetMetabotInstanceLimitQuery();
  const [updateInstanceLimit] = useUpdateMetabotInstanceLimitMutation();

  // Local state
  const [limitType, setLimitType] = useState<MetabotLimitType>(
    savedLimitType ?? "tokens",
  );
  const [limitPeriod, setLimitPeriod] = useState<MetabotLimitPeriod>(
    savedLimitPeriod ?? "monthly",
  );
  const [instanceLimitInput, setInstanceLimitInput] = useState("");
  const [quotaMessage, setQuotaMessage] = useState(savedQuotaMessage ?? "");
  const { sendErrorToast } = useMetadataToasts();

  // Sync from backend when settings load
  useEffect(() => {
    if (savedLimitType) {
      setLimitType(savedLimitType);
    }
  }, [savedLimitType]);

  useEffect(() => {
    if (savedLimitPeriod) {
      setLimitPeriod(savedLimitPeriod);
    }
  }, [savedLimitPeriod]);

  useEffect(() => {
    setQuotaMessage(savedQuotaMessage ?? "");
  }, [savedQuotaMessage]);

  useEffect(() => {
    if (instanceLimitData) {
      setInstanceLimitInput(
        instanceLimitData.max_usage != null
          ? String(instanceLimitData.max_usage)
          : "",
      );
    }
  }, [instanceLimitData]);

  // Debounced save functions
  const debouncedSaveInstanceLimit = useDebouncedCallback(
    async (value: string) => {
      try {
        const maxUsage = value ? Number(value) : null;
        await updateInstanceLimit({ max_usage: maxUsage }).unwrap();
      } catch {
        sendErrorToast(t`Failed to update instance limit`);
      }
    },
    SAVE_DEBOUNCE_MS,
  );

  const debouncedSaveQuotaMessage = useDebouncedCallback(
    async (value: string) => {
      updateQuotaMessageSetting({
        key: "metabot-quota-reached-message",
        value: value || null,
        toast: false,
      });
    },
    SAVE_DEBOUNCE_MS,
  );

  const limitTypeOptions: LimitTypeOption[] = useMemo(() => {
    return [
      { value: "tokens", label: t`By token usage` },
      { value: "conversation", label: t`By conversation count` },
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

  const handleLimitTypeChange = (value: MetabotLimitType) => {
    setLimitType(value);
    updateLimitTypeSetting({
      key: "metabot-limit-type",
      value,
      toast: false,
    });
  };

  const handleLimitPeriodChange = (value: MetabotLimitPeriod) => {
    setLimitPeriod(value);
    updateLimitPeriodSetting({
      key: "metabot-limit-reset-rate",
      value,
      toast: false,
    });
  };

  const handleInstanceLimitChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = e.target.value;
    setInstanceLimitInput(value);
    debouncedSaveInstanceLimit(value);
  };

  const handleQuotaMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuotaMessage(value);
    debouncedSaveQuotaMessage(value);
  };

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
            onChange={handleLimitTypeChange}
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
            onChange={handleLimitPeriodChange}
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
          value={instanceLimitInput}
          onChange={handleInstanceLimitChange}
        />
        <TextInput
          label={t`Quota-reached message`}
          description={c(
            "{0} indicates the limit reset period, e.g., daily, weekly, monthly",
          )
            .t`The message shown to users when they reach their ${limitLabel.toLowerCase()} quota.`}
          placeholder={t`You've reached your limit for the month.`}
          classNames={{
            input: S.QuotaMessageInput,
            description: S.InputDescription,
          }}
          value={quotaMessage}
          onChange={handleQuotaMessageChange}
        />
      </Stack>
    </SettingsSection>
  );
}
