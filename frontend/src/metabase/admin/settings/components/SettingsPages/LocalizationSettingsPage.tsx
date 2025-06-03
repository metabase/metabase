import { t } from "ttag";
import _ from "underscore";

import { useSetting } from "metabase/common/hooks";
import { Box, Stack, Title } from "metabase/ui";

import { SettingSection } from "../SettingsSection";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { FormattingWidget } from "../widgets/FormattingWidget";

export function LocalizationSettingsPage() {
  const availableLocales = useSetting("available-locales");
  const availableTimezones = useSetting("available-timezones");
  return (
      <Stack gap="lg" maw="36rem">
        <Title order={1}>{t`Localization`}</Title>
        <SettingSection
          title={t`Location settings`}
          description={t`Customize language, timezone, and calendar settings for your location`}
        >
          <AdminSettingInput
            name="site-locale"
            title={t`Instance language`}
            options={_.sortBy(availableLocales || [], ([, label]) => label).map(
              ([code, label]) => ({ label, value: code }),
            )}
            inputType="select"
          />
          <AdminSettingInput
            name="report-timezone"
            searchable
            title={t`Report Timezone`}
            description={
              <>
                <div>{t`Connection timezone to use when executing queries. Defaults to system timezone.`}</div>
                <div>{t`Not all databases support timezones, in which case this setting won't take effect.`}</div>
              </>
            }
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
        </SettingSection>
        <SettingSection
          title={t`Formatting options`}
          description={t`Customize how numbers and dates appear throughout Metabase`}
        >
          <FormattingWidget />
        </SettingSection>
      </Stack>
  );
}
