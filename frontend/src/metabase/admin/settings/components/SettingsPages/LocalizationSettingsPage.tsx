import cx from "classnames";
import { t } from "ttag";

import { UpsellHostingUpdates } from "metabase/admin/upsells";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Box, Flex } from "metabase/ui";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { VersionUpdateNotice } from "../widgets/VersionUpdateNotice";

export function LocalizationSettingsPage() {
  const isHosted = useSetting("is-hosted?");
  const availableLocales = useSetting("available-locales");
  const availableTimezones = useSetting("available-timezones");
  const checkForUpdates = useSetting("check-for-updates");
  return (
    <Flex justify="space-between" data-testid="settings-updates">
      <Box w="36rem">
        {!isHosted && (
          <>
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
          </>
        )}
        {checkForUpdates && (
          <div
            className={cx(CS.pt3, CS.px2, {
              [CS.borderTop]: !isHosted,
            })}
          >
            <VersionUpdateNotice />
          </div>
        )}
      </Box>
      <div>
        <UpsellHostingUpdates source="settings-updates-migrate_to_cloud" />
      </div>
    </Flex>
  );
}

// localization: {
//     name: t`Localization`,
//     order: 80,
//     settings: [
//       {
//         display_name: t`Instance language`,
//         key: "site-locale",
//         type: "select",
//         options: _.sortBy(
//           MetabaseSettings.get("available-locales") || [],
//           ([code, name]) => name,
//         ).map(([code, name]) => ({ name, value: code })),
//         defaultValue: "en",
//         onChanged: (oldLocale, newLocale) => {
//           if (oldLocale !== newLocale) {
//             window.location.reload();
//           }
//         },
//       },
//       {
//         key: "report-timezone",
//         display_name: t`Report Timezone`,
//         type: "select",
//         options: [
//           { name: t`Database Default`, value: "" },
//           ...(MetabaseSettings.get("available-timezones") || []),
//         ],
//         description: (
//           <>
//             <div>{t`Connection timezone to use when executing queries. Defaults to system timezone.`}</div>
//             <div>{t`Not all databases support timezones, in which case this setting won't take effect.`}</div>
//           </>
//         ),
//         allowValueCollection: true,
//         searchProp: "name",
//         defaultValue: "",
//       },
//       {
//         key: "start-of-week",
//         display_name: t`First day of the week`,
//         type: "select",
//         options: [
//           { value: "sunday", name: t`Sunday` },
//           { value: "monday", name: t`Monday` },
//           { value: "tuesday", name: t`Tuesday` },
//           { value: "wednesday", name: t`Wednesday` },
//           { value: "thursday", name: t`Thursday` },
//           { value: "friday", name: t`Friday` },
//           { value: "saturday", name: t`Saturday` },
//         ],
//         defaultValue: "sunday",
//       },
//       {
//         display_name: t`Localization options`,
//         description: "",
//         key: "custom-formatting",
//         widget: FormattingWidget,
//       },
//     ],
//   },
