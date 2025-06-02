import { jt, t } from "ttag";
import _ from "underscore";

import { useSetting } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getCrowdinUrl } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Stack } from "metabase/ui";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { FormattingWidget } from "../widgets/FormattingWidget";

export function LocalizationSettingsPage() {
  const availableLocales = useSetting("available-locales");
  const availableTimezones = useSetting("available-timezones");
  const applicationName = useSelector(getApplicationName);
  const translatedLink = (
    <Link
      to={getCrowdinUrl()}
      variant="brand"
      target="_blank"
    >{t`contribute to translations here`}</Link>
  );

  return (
    <Box w="36rem" p="0 2rem 2rem 1rem">
      <Stack gap="xl">
        <AdminSettingInput
          name="site-locale"
          title={t`Instance language`}
          options={_.sortBy(availableLocales || [], ([, label]) => label).map(
            ([code, label]) => ({ label, value: code }),
          )}
          inputType="select"
          description={
            <>
              {t`The default language for all users across the ${applicationName} UI, system emails, subscriptions, and alerts. Each user can override this from their own account settings.`}
              <br />
              <br />
              {t`Some translations are created by the ${applicationName} community, and might not be perfect.`}{" "}
              {jt`You can ${translatedLink}`}.
            </>
          }
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
        <FormattingWidget />
      </Stack>
    </Box>
  );
}
