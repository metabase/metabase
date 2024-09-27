import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { Box, Button } from "metabase/ui";

import SettingHeader from "../../SettingHeader";

import { useEmbeddingSettingsLinks } from "./sdk";

export const GetStarted = () => {
  const isEE = PLUGIN_EMBEDDING_SDK.isEnabled();

  const { quickStartUrl } = useEmbeddingSettingsLinks();

  return (
    <Box>
      <SettingHeader
        id="get-started"
        setting={
          isEE
            ? {
                display_name: t`Get started`,
              }
            : {
                display_name: t`Try Embedded analytics SDK`,
                description: t`Use the SDK with API keys for development.`,
              }
        }
      />
      <Button
        variant="outline"
        component={ExternalLink}
        href={quickStartUrl}
      >{t`Check out the Quick Start`}</Button>
    </Box>
  );
};
