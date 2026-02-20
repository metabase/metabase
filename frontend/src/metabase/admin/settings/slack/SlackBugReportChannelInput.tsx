import { useEffect, useState } from "react";
import { t } from "ttag";

import { useUpdateSlackSettingsMutation } from "metabase/api";
import { useSetting, useToast } from "metabase/common/hooks";
import { Box, Text, TextInput } from "metabase/ui";

import { SettingHeader } from "../components/SettingHeader";

const getSlackError = (err: unknown): string =>
  (err as { data?: { errors?: { "slack-bug-report-channel"?: string } } })?.data
    ?.errors?.["slack-bug-report-channel"] ?? t`Failed to update channel`;

export const SlackBugReportChannelInput = () => {
  const initialValue = useSetting("slack-bug-report-channel");
  const [updateSlackSettings] = useUpdateSlackSettingsMutation();
  const [sendToast] = useToast();
  const [localValue, setLocalValue] = useState(initialValue ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalValue(initialValue ?? "");
  }, [initialValue]);

  const handleBlur = async () => {
    const trimmedValue = localValue.replace(/^#+/, "");
    setLocalValue(trimmedValue);

    const value = trimmedValue === "" ? null : trimmedValue.toLowerCase();
    if (value === initialValue) {
      return;
    }

    setError(null);
    try {
      await updateSlackSettings({ "slack-bug-report-channel": value }).unwrap();
      sendToast({
        message: t`Slack bug report channel updated`,
        toastColor: "success",
      });
    } catch (err) {
      setError(getSlackError(err));
    }
  };

  return (
    <Box data-testid="slack-bug-report-channel-setting">
      <SettingHeader
        id="slack-bug-report-channel"
        title={t`Slack bug report channel`}
        description={t`This channel will receive bug reports submitted by users.`}
      />
      <TextInput
        id="slack-bug-report-channel"
        value={localValue}
        placeholder="metabase-bugs"
        onChange={(e) => {
          setLocalValue(e.target.value);
          setError(null);
        }}
        onBlur={handleBlur}
        leftSection={<Text c="text-secondary">#</Text>}
        error={error}
      />
    </Box>
  );
};
