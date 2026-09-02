import type { FormikHelpers } from "formik";
import { flushSync } from "react-dom";
import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { isSettingSetFromEnvVar } from "metabase/admin/settings/settings";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormSwitch,
  FormTextarea,
} from "metabase/forms";
import { useAdminSetting, useAdminSettings } from "metabase/settings";
import { Box, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { reload } from "metabase/utils/dom";

import { SettingHeader } from "../SettingHeader";

import {
  type DomainsSettings,
  isDomainSettingsDirty,
  isEmptyString,
  normalizeDomainSettings,
} from "./domainSettingsUtils";

export function DomainsSettingsPage() {
  const { values, details, updateSettings, isLoading, error } =
    useAdminSettings([
      "allowed-iframe-hosts",
      "csp-img-enabled",
      "csp-img-allowed-hosts",
    ]);

  const { url: iframeDocsUrl } = useDocsUrl("configuring-metabase/settings", {
    anchor: "allowed-domains-for-iframes-in-dashboards",
  });
  const { url: imgDocsUrl } = useDocsUrl("configuring-metabase/settings", {
    anchor: "allowed-domains-for-images",
  });

  const customVizAvailable = useHasTokenFeature("custom-viz-available");
  const { value: customVizEnabled } = useAdminSetting("custom-viz-enabled");

  const onSubmit = async (
    values: DomainsSettings,
    { resetForm }: FormikHelpers<DomainsSettings>,
  ) => {
    const { error } = await updateSettings({
      ...normalizeDomainSettings(values),
      toast: false,
    });
    if (error) {
      throw error;
    }
    // CSP settings need a reload to take effect
    // but reloading while the form is dirty triggers LeaveRouteConfirmModal
    // so synchronously reset the form
    flushSync(() => resetForm({ values }));
    reload();
  };

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <SettingsPageWrapper title={t`Domains`}>
      <SettingsSection>
        <FormProvider
          initialValues={{
            ...values,
            "allowed-iframe-hosts": isEmptyString(
              values["allowed-iframe-hosts"],
            )
              ? ""
              : values["allowed-iframe-hosts"],
          }}
          onSubmit={onSubmit}
        >
          {({ initialValues, values }) => {
            const dirty = isDomainSettingsDirty(initialValues, values);
            return (
              <>
                <Form disabled={!dirty}>
                  <Stack gap="lg">
                    <Box>
                      <SettingHeader
                        id="allowed-iframe-hosts"
                        title={t`Allowed domains for iframes in dashboards`}
                        description={
                          <>
                            {jt`You should make sure to trust the sources you allow your users to embed in dashboards. ${<ExternalLink key="docs" href={iframeDocsUrl}>{t`Learn more`}</ExternalLink>}`}
                          </>
                        }
                      />
                      {isSettingSetFromEnvVar(
                        details["allowed-iframe-hosts"],
                      ) ? (
                        <SetByEnvVar
                          varName={details["allowed-iframe-hosts"].env_name}
                        />
                      ) : (
                        <FormTextarea
                          id="allowed-iframe-hosts"
                          name="allowed-iframe-hosts"
                          nullable
                        />
                      )}
                    </Box>
                    <Box>
                      <SettingHeader
                        id="csp-img-enabled"
                        title={t`Restrict image domains`}
                        description={
                          customVizEnabled
                            ? jt`Required by Custom Visualizations. Turn off ${(
                                <Link
                                  key="custom-viz"
                                  to={Urls.customViz()}
                                  variant="brand"
                                >
                                  {t`Custom Visualizations`}
                                </Link>
                              )} before disabling this setting.`
                            : customVizAvailable
                              ? jt`Restrict the browser's Content Security Policy so images can only load from this Metabase instance or the domains you list below. Required to enable Custom Visualizations. ${<ExternalLink key="img-docs" href={imgDocsUrl}>{t`Learn more`}</ExternalLink>}`
                              : t`Restrict the browser's Content Security Policy so images can only load from this Metabase instance or the domains you list below.`
                        }
                      />
                      {isSettingSetFromEnvVar(details["csp-img-enabled"]) ? (
                        <SetByEnvVar
                          varName={details["csp-img-enabled"].env_name}
                        />
                      ) : (
                        <FormSwitch
                          id="csp-img-enabled"
                          name="csp-img-enabled"
                          label={
                            values["csp-img-enabled"] ? t`Enabled` : t`Disabled`
                          }
                          size="sm"
                          disabled={Boolean(customVizEnabled)}
                        />
                      )}
                    </Box>
                    <Box>
                      <SettingHeader
                        id="csp-img-allowed-hosts"
                        title={t`Allowed domains for images`}
                        description={
                          values["csp-img-enabled"]
                            ? customVizAvailable
                              ? jt`Domains that images can be loaded from in dashboard text, entity descriptions, and custom visualizations. Leave empty to only allow images hosted by this Metabase instance. ${<ExternalLink key="img-docs" href={imgDocsUrl}>{t`Learn more`}</ExternalLink>}`
                              : jt`Domains that images can be loaded from in dashboard text and entity descriptions. Leave empty to only allow images hosted by this Metabase instance. ${<ExternalLink key="img-docs" href={imgDocsUrl}>{t`Learn more`}</ExternalLink>}`
                            : t`Turn on the "Restrict image domains" setting above to enforce this allowlist.`
                        }
                      />
                      {isSettingSetFromEnvVar(
                        details["csp-img-allowed-hosts"],
                      ) ? (
                        <SetByEnvVar
                          varName={details["csp-img-allowed-hosts"].env_name}
                        />
                      ) : (
                        <FormTextarea
                          id="csp-img-allowed-hosts"
                          name="csp-img-allowed-hosts"
                          disabled={!values["csp-img-enabled"]}
                          nullable
                        />
                      )}
                    </Box>
                    <FormErrorMessage />
                    <FormSubmitButton
                      label={t`Save changes`}
                      variant="filled"
                      disabled={!dirty}
                      style={{ alignSelf: "flex-end" }}
                    />
                  </Stack>
                </Form>
                <LeaveRouteConfirmModal isEnabled={dirty} />
              </>
            );
          }}
        </FormProvider>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}
