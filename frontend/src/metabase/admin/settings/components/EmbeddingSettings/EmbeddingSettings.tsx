import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Stack, Text } from "metabase/ui";

import SettingHeader from "../SettingHeader";
import {
  EmbeddingSdkOptionCard,
  InteractiveEmbeddingOptionCard,
  StaticEmbeddingOptionCard,
} from "../widgets/EmbeddingOption";

export const EmbeddingSettings = () => (
  <Stack spacing="2.5rem" px="md" pt="sm">
    <Box data-testid="enable-embedding-setting">
      <SettingHeader
        id="enable-embedding"
        setting={{
          display_name: t`Embedding`,
        }}
      />
      <Stack spacing={"md"} className={CS.textMeasure}>
        <Text lh={1.5}>
          {t`Embed dashboards, questions, or the entire Metabase app into your application. Integrate with your server code to create a secure environment, limited to specific users or organizations.`}
        </Text>
      </Stack>
    </Box>
    <StaticEmbeddingOptionCard />
    <EmbeddingSdkOptionCard />
    <InteractiveEmbeddingOptionCard />
  </Stack>
);
