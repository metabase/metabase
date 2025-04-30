import { t } from "ttag";
import _ from "underscore";

import { UpsellHostingUpdates } from "metabase/admin/upsells";
import { useSetting } from "metabase/common/hooks";
import { Box, Flex, Stack } from "metabase/ui";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { FormattingWidget } from "../widgets/FormattingWidget";

export function LocalizationSettingsPage() {
  const isHosted = useSetting("is-hosted?");
  const availableLocales = useSetting("available-locales");
  const availableTimezones = useSetting("available-timezones");
  return (
    <Flex justify="space-between" data-testid="settings-updates">
      <Box w="36rem">
        {!isHosted && (
          <Stack gap="xl">
            <AdminSettingInput
              name="site-locale"
              title={t`Instance language`}
              options={_.sortBy(
                availableLocales || [],
                ([, label]) => label,
              ).map(([code, label]) => ({ label, value: code }))}
              inputType="select"
            />
            <AdminSettingInput
              name="report-timezone"
              title={t`Report Timezone`}
              options={[
                { label: t`Database Default`, value: "" },
                ...(availableTimezones?.map((tz) => ({
                  label: tz,
                  value: tz,
                })) || []),
              ]}
              inputType="select"
            />
            <AdminSettingInput
              name="start-of-week"
              title={t`First day of the week`}
              options={[
                { value: "sunday", label: t`Sunday` },
                { value: "monday", label: t`Monday` },
                { value: "tuesday", label: t`Tuesday` },
                { value: "wednesday", label: t`Wednesday` },
                { value: "thursday", label: t`Thursday` },
                { value: "friday", label: t`Friday` },
                { value: "saturday", label: t`Saturday` },
              ]}
              inputType="select"
            />
            <FormattingWidget />
          </Stack>
        )}
      </Box>
      <div>
        <UpsellHostingUpdates source="settings-updates-migrate_to_cloud" />
      </div>
    </Flex>
  );
}
