import type { InteractiveV2Settings } from "metabase/public/hooks/use-interactive-v2-settings";
import { Box, Code, Grid, Text } from "metabase/ui";

import S from "./InteractiveEmbeddingDemo.module.css";

// Hard-coded API key for demonstration purposes only.
// In the real implementation, we might not use API key at all,
// or at least create the most restricted API key possible for public usage.
const DEMO_API_KEY = "mb_Fxoc6Cns8Stk3BxJi33ova6Vmi8GpVDQetZsPWMTEzY=";

export const InteractiveEmbeddingDemo = () => {
  const config: InteractiveV2Settings = {
    apiKey: DEMO_API_KEY,
    embedResourceType: "dashboard",
    embedResourceId: 1,
  };

  const encodedConfig = btoa(JSON.stringify(config));
  const iframePreviewUrl = `/embed/interactive/${encodedConfig}`;
  const iframeExampleSnippet = `
    <iframe src="${window.location.origin}${iframePreviewUrl}"></iframe>
  `;

  return (
    <Box p="lg">
      <Text size="xl" fw="bold">
        Simple Interactive Embedding Prototype
      </Text>

      <Text mb="md" c="text-secondary">
        This is a prototype of a simplified version of interactive embedding. It
        is not ready for production usage.
      </Text>

      <Grid>
        <Grid.Col span={8}>
          <iframe src={iframePreviewUrl} className={S.PreviewIframe} />

          <Box p="md">
            <Text mb="sm">
              Copy the following code snippet to your website:
            </Text>

            <Box maw="400px">
              <Code style={{ wordBreak: "break-all" }} bg="transparent">
                {iframeExampleSnippet}
              </Code>
            </Box>
          </Box>
        </Grid.Col>

        <Grid.Col span={4}></Grid.Col>
      </Grid>
    </Box>
  );
};
