import { useFormikContext } from "formik";
import { t } from "ttag";

import { FormTextInput } from "metabase/forms";
import { useGetAdminSettingsDetailsQuery } from "metabase/settings";
import { Box, Text } from "metabase/ui";

import { TOKEN_KEY, URL_KEY } from "../../constants";
import type { RemoteSyncSettingsFormState } from "../../types";
import { getEnvSettingProps } from "../../utils";

import { RemoteSyncSettingsSection } from "./RemoteSyncSettingsSection";
import { TestConnectionButton } from "./TestConnectionButton";

export const GitSettingsSection = () => {
  const { values } = useFormikContext<RemoteSyncSettingsFormState>();
  const { data: settingDetails } = useGetAdminSettingsDetailsQuery();

  return (
    <RemoteSyncSettingsSection title={t`Git settings`}>
      <FormTextInput
        name={URL_KEY}
        label={t`Repository URL`}
        placeholder="https://git-host.example.com/yourcompany/repo.git"
        labelProps={{ mb: "0.75rem" }}
        {...getEnvSettingProps(settingDetails?.[URL_KEY])}
      />
      <FormTextInput
        name={TOKEN_KEY}
        label={t`Access Token`}
        description={
          <Text c="text-disabled" size="sm" lh="md" component="span">
            {t`Personal access token with write permissions`}
          </Text>
        }
        type="password"
        {...getEnvSettingProps(settingDetails?.[TOKEN_KEY], {
          inputWrapperOrder: ["label", "description", "error"],
        })}
      />
      <Box>
        <TestConnectionButton values={values} />
      </Box>
    </RemoteSyncSettingsSection>
  );
};
