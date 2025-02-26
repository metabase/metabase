import { useState } from "react";

import ColorPicker from "metabase/core/components/ColorPicker";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import type { InteractiveV2Settings } from "metabase/public/hooks/use-interactive-v2-settings";
import {
  Box,
  Center,
  Code,
  Grid,
  Group,
  Radio,
  Text,
  TextInput,
} from "metabase/ui";
import { isBaseEntityID } from "metabase-types/api/entity-id";

import S from "./InteractiveEmbeddingDemo.module.css";

// Hard-coded API key for demonstration purposes only.
// In the real implementation, we might not use API key at all,
// or at least create the most restricted API key possible for public usage.
const DEMO_API_KEY = "mb_Fxoc6Cns8Stk3BxJi33ova6Vmi8GpVDQetZsPWMTEzY=";

const DEFAULT_DASHBOARD_ID = 1;
const DEFAULT_QUESTION_ID = 5;
const THEME_COLOR_DEBOUNCE_DELAY = 300;

const DEFAULT_THEME_COLORS = {
  background: "#fff",
  "text-primary": "#4c5773",
  "text-secondary": "#696e7b",
  primary: "#509ee3",
};

export const InteractiveEmbeddingDemo = () => {
  const [resourceType, setResourceType] = useState<"dashboard" | "question">(
    "dashboard",
  );
  const [resourceId, setResourceId] = useState<string>("1");
  const [themeColors, setThemeColors] = useState(DEFAULT_THEME_COLORS);
  const debouncedThemeColors = useDebouncedValue(
    themeColors,
    THEME_COLOR_DEBOUNCE_DELAY,
  );

  const getResourceId = (input: string) => {
    if (isBaseEntityID(input)) {
      return input;
    }

    const numericId = parseInt(input);

    const defaultResourceId =
      resourceType === "dashboard" ? DEFAULT_DASHBOARD_ID : DEFAULT_QUESTION_ID;

    return !isNaN(numericId) ? numericId : defaultResourceId;
  };

  const handleColorChange =
    (colorKey: keyof typeof DEFAULT_THEME_COLORS) => (color?: string) => {
      if (color) {
        setThemeColors(prev => ({
          ...prev,
          [colorKey]: color,
        }));
      }
    };

  const config: InteractiveV2Settings = {
    apiKey: DEMO_API_KEY,
    embedResourceType: resourceType,
    embedResourceId: getResourceId(resourceId),
    theme: {
      colors: debouncedThemeColors,
    },
  };

  const encodedConfig = btoa(JSON.stringify(config));
  const iframePreviewUrl = `/embed/interactive/${encodedConfig}`;
  const iframeExampleSnippet = `
    <iframe src="${window.location.origin}${iframePreviewUrl}"></iframe>
  `;

  const resourceName = resourceType === "dashboard" ? "Dashboard" : "Question";

  return (
    <Center>
      <Box p="lg" w="100%" maw="1200px">
        <Text size="xl" fw="bold">
          Simple Interactive Embedding Prototype
        </Text>

        <Text mb="md" c="text-secondary">
          This is a prototype of a simplified version of interactive embedding.
          It is not ready for production usage.
        </Text>

        <Grid>
          <Grid.Col span={7}>
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

          <Grid.Col span={5}>
            <Box p="md">
              <Text size="lg" fw="bold" mb="md">
                Setup
              </Text>

              <Box mb="lg">
                <Text mb="xs">What to embed?</Text>

                <Radio.Group
                  value={resourceType}
                  onChange={value => {
                    const resourceType = value as "dashboard" | "question";

                    const defaultResourceId = String(
                      resourceType === "dashboard"
                        ? DEFAULT_DASHBOARD_ID
                        : DEFAULT_QUESTION_ID,
                    );

                    setResourceType(resourceType);
                    setResourceId(defaultResourceId);
                  }}
                >
                  <Group>
                    <Radio value="dashboard" label="Dashboard" />
                    <Radio value="question" label="Question" />
                  </Group>
                </Radio.Group>
              </Box>

              <Box mb="lg">
                <Text mb="xs">{resourceName} ID</Text>
                <TextInput
                  value={resourceId}
                  onChange={e => setResourceId(e.target.value)}
                  placeholder={`Enter ${resourceType} ID or Entity ID`}
                />
                <Text size="xs" c="text-secondary" mt="xs">
                  Can be a number or an Entity ID (21-character string)
                </Text>
              </Box>

              <Box>
                <Text size="lg" fw="bold" mb="md">
                  Theme Colors
                </Text>

                <Box mb="md">
                  <Text mb="xs">Primary Color</Text>
                  <ColorPicker
                    value={themeColors.primary}
                    onChange={handleColorChange("primary")}
                  />
                  <Text size="xs" c="text-secondary" mt="xs">
                    Used for buttons, links, and interactive elements
                  </Text>
                </Box>

                <Box mb="md">
                  <Text mb="xs">Background Color</Text>
                  <ColorPicker
                    value={themeColors.background}
                    onChange={handleColorChange("background")}
                  />
                </Box>

                <Box mb="md">
                  <Text mb="xs">Primary Text Color</Text>
                  <ColorPicker
                    value={themeColors["text-primary"]}
                    onChange={handleColorChange("text-primary")}
                  />
                </Box>

                <Box mb="md">
                  <Text mb="xs">Secondary Text Color</Text>
                  <ColorPicker
                    value={themeColors["text-secondary"]}
                    onChange={handleColorChange("text-secondary")}
                  />
                </Box>
              </Box>
            </Box>
          </Grid.Col>
        </Grid>
      </Box>
    </Center>
  );
};
