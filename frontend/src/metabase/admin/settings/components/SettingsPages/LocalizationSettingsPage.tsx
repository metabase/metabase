import { t } from "ttag";
import _ from "underscore";

import MetabaseSettings from "metabase/lib/settings";
import { Box, Stack } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import FormattingWidget from "../widgets/FormattingWidget";

export function LocalizationSettingsPage() {
  return (
    <Stack gap="xl" maw="42rem" px="lg" py="sm">
      <AdminSettingInput
        name="site-locale"
        title={t`Instance language`}
        options={_.sortBy(
          MetabaseSettings.get("available-locales") || [],
          ([code, name]) => name,
        ).map(([code, name]) => ({ label: name, value: code }))}
        inputType="select"
      />

      <AdminSettingInput
        name="report-timezone"
        title={t`Report Timezone`}
        description={
          <>
            <div>{t`Connection timezone to use when executing queries. Defaults to system timezone.`}</div>
            <div>{t`Not all databases support timezones, in which case this setting won't take effect.`}</div>
          </>
        }
        options={[
          { label: t`Database Default`, value: "" },
          ...(MetabaseSettings.get("available-timezones") || []).map(
            ({ name, value }) => ({ label: name, value }),
          ),
        ]}
        inputType="select"
      />

      <AdminSettingInput
        name="start-of-week"
        title={t`First day of the week`}
        options={[
          { label: t`Sunday`, value: "sunday" },
          { label: t`Monday`, value: "monday" },
          { label: t`Tuesday`, value: "tuesday" },
          { label: t`Wednesday`, value: "wednesday" },
          { label: t`Thursday`, value: "thursday" },
          { label: t`Friday`, value: "friday" },
          { label: t`Saturday`, value: "saturday" },
        ]}
        inputType="select"
      />

      <Box>
        <SettingHeader
          id="custom-formatting"
          title={t`Localization options`}
          description=""
        />
        <CustomFormattingWidgetContainer />
      </Box>
    </Stack>
  );
}

function CustomFormattingWidgetContainer() {
  const value = MetabaseSettings.get("custom-formatting") || {};

  return (
    <FormattingWidget
      setting={{
        value,
        default: {},
      }}
      onChange={newValue => {
        MetabaseSettings.set("custom-formatting", newValue);
      }}
    />
  );
}