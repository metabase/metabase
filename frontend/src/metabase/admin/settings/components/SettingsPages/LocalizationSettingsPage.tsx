import { t } from "ttag";
import _ from "underscore";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { CommunityLocalizationNotice } from "metabase/common/components/CommunityLocalizationNotice";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Stack } from "metabase/ui";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { FormattingWidget } from "../widgets/FormattingWidget";

export function LocalizationSettingsPage() {
  const availableLocales = useSetting("available-locales");
  const availableTimezones = useSetting("available-timezones");
  const applicationName = useSelector(getApplicationName);

  return (
    <SettingsPageWrapper title={t`Localization`}>
      <SettingsSection title={t`Instance settings`}>
        <AdminSettingInput
          name="site-locale"
          title={t`Instance language`}
          options={_.sortBy(availableLocales || [], ([, label]) => label).map(
            ([code, label]) => ({ label, value: code }),
          )}
          inputType="select"
          description={
            <Stack gap="md">
              {t`The default language for all users across the ${applicationName} UI, system emails, subscriptions, and alerts. Each user can override this from their own account settings.`}
              <CommunityLocalizationNotice isAdminView />
            </Stack>
          }
        />
        <AdminSettingInput
          name="report-timezone"
          searchable
          title={t`Report timezone`}
          description={
            <>
              <div>{t`Connection timezone to use when executing queries. Defaults to system timezone.`}</div>
              <div>{t`Not all databases support timezones, in which case this setting won't take effect.`}</div>
            </>
          }
          options={[
            { label: t`Database default`, value: "" },
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
      </SettingsSection>
      <FormattingWidget />
    </SettingsPageWrapper>
  );
}
