import { jt, t } from "ttag";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useDispatch } from "metabase/lib/redux";
import { Box, Stack } from "metabase/ui";

import { updateSetting } from "../../settings";
import SettingHeader from "../SettingHeader";
import { SetByEnvVarWrapper } from "../SettingsSetting";
import { SettingTextInput } from "../widgets/SettingTextInput";

export function EmbeddingSdkSettings() {
  const setting = {
    key: "embedding-app-origins-sdk",
    placeholder: "https://*.example.com",
    display_name: t`Cross-Origin Resource Sharing (CORS)`,
    description: jt`Enter the origins for the websites or web apps where you want to allow SDK embedding, separated by a space. Here are the ${(
      <ExternalLink
        key="specs"
        href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors"
      >
        {t`exact specifications`}
      </ExternalLink>
    )} for what can be entered.`,
  };

  const dispatch = useDispatch();

  function onChangeSdkOrigins(value: string | null) {
    dispatch(
      updateSetting({
        key: "embedding-app-origins-sdk",
        value,
      }),
    );
  }
  return (
    <Box p="0.5rem 1rem 0">
      <Stack spacing="2.5rem">
        <Breadcrumbs
          size="large"
          crumbs={[
            [t`Embedding`, "/admin/settings/embedding-in-other-applications"],
            [t`Interactive embedding`],
          ]}
        />
        <Box>
          <SettingHeader id={setting.key} setting={setting} />
          <SetByEnvVarWrapper setting={setting}>
            <SettingTextInput
              setting={setting}
              onChange={onChangeSdkOrigins}
              type="text"
            />
          </SetByEnvVarWrapper>
        </Box>
      </Stack>
    </Box>
  );
}
