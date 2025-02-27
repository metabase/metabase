import { useEffect, useRef, useState } from "react";

import { useCreateApiKeyMutation } from "metabase/api";
import { CopyButton } from "metabase/components/CopyButton";
import ColorPicker from "metabase/core/components/ColorPicker";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { useSelector } from "metabase/lib/redux";
import type { InteractiveV2Settings } from "metabase/public/hooks/use-interactive-v2-settings";
import type { EmbedResourceType } from "metabase/public/lib/types";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  ActionIcon,
  Box,
  Center,
  Code,
  Grid,
  Group,
  Icon,
  Loader,
  Radio,
  Text,
  TextInput,
} from "metabase/ui";
import { isBaseEntityID } from "metabase-types/api/entity-id";

import S from "./InteractiveEmbeddingDemo.module.css";

const DEFAULT_DASHBOARD_ID = 1;
const DEFAULT_QUESTION_ID = 5;
const THEME_COLOR_DEBOUNCE_DELAY = 300;

const DEFAULT_THEME_COLORS = {
  background: "#fff",
  "text-primary": "#4c5773",
  "text-secondary": "#696e7b",
  brand: "#509ee3",
};

type EmbedMode = EmbedResourceType | "exploration";

// Hard-coded API key for demonstration purposes only.
// In the real implementation, we might not use API key at all,
// or at least create the most restricted API key possible for public usage.
const DEMO_API_KEY = "mb_Fxoc6Cns8Stk3BxJi33ova6Vmi8GpVDQetZsPWMTEzY=";

export const InteractiveEmbeddingDemo = ({
  withApiKeyInput = true,
  canGenerateApiKey = true,
}: {
  withApiKeyInput?: boolean;
  canGenerateApiKey?: boolean;
}) => {
  const [isLoadingEmbedJs, setIsLoadingEmbedJs] = useState(true);
  const iframeParentRef = useRef<HTMLDivElement>(null);

  const [embedMode, setEmbedMode] = useState<EmbedMode>("dashboard");
  const [resourceId, setResourceId] = useState<string>("1");
  const [themeColors, setThemeColors] = useState(DEFAULT_THEME_COLORS);
  const [apiKey, setApiKey] = useState(DEMO_API_KEY);
  const [createApiKey] = useCreateApiKeyMutation();

  const userIsAdmin = useSelector(getUserIsAdmin);

  // Only allow API key generation for admins.
  const allowGenerateApiKey = userIsAdmin && canGenerateApiKey;

  const debouncedThemeColors = useDebouncedValue(
    themeColors,
    THEME_COLOR_DEBOUNCE_DELAY,
  );

  const handleCreateApiKey = async () => {
    try {
      const timestamp = new Date().toISOString();
      const result = await createApiKey({
        name: `Simple Embedding Demo ${timestamp}`,
        group_id: 1, // All Users group
      }).unwrap();
      setApiKey(result.unmasked_key);
    } catch (error) {
      console.error("Failed to create API key:", error);
    }
  };

  const getResourceId = (input: string) => {
    if (!input) {
      return;
    }

    // Setting questionId to "new" will embed a query builder.
    if (embedMode === "exploration") {
      return "new";
    }

    if (isBaseEntityID(input)) {
      return input;
    }

    const numericId = parseInt(input);

    const defaultResourceId =
      embedMode === "dashboard" ? DEFAULT_DASHBOARD_ID : DEFAULT_QUESTION_ID;

    return !isNaN(numericId) ? numericId : defaultResourceId;
  };

  const getResourceType = (embedMode: EmbedMode): EmbedResourceType => {
    if (embedMode === "exploration") {
      return "question";
    }

    return embedMode;
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
    embedResourceType: getResourceType(embedMode),
    embedResourceId: getResourceId(resourceId),
    theme: {
      colors: debouncedThemeColors,
    },
  };

  const encodedConfig = btoa(JSON.stringify(config));
  const iframePreviewUrl = `/embed/interactive/${encodedConfig}`;
  const origin = window.location.origin;

  const iframeExampleSnippet = `
<script src="${origin}/app/embed.js"></script>

<div id="metabase-embed-container"></div>

<script>
  const { MetabaseEmbed } = window["metabase.embed"];

  const embed = new MetabaseEmbed({
    target: "#metabase-embed-container",

    // IMPORTANT: You must create a least privileged and sandboxed API key for
    // public usage. Otherwise, you risk exposing Metabase to unwanted access.
    apiKey: "${apiKey}"

    url: "${origin}${iframePreviewUrl}",
  });
</script>
  `.trim();

  const resourceName = embedMode === "dashboard" ? "Dashboard" : "Question";

  // Attach the embed.js to the page
  useEffect(() => {
    const scriptElement = document.createElement("script");
    scriptElement.src = "/app/embed.js";
    scriptElement.onload = () => setIsLoadingEmbedJs(false);

    document.head.appendChild(scriptElement);

    return () => {
      document.head.removeChild(scriptElement);
    };
  }, []);

  useEffect(() => {
    if (iframeParentRef.current && !isLoadingEmbedJs) {
      const windowWithEmbed = window as unknown as Window & {
        "metabase.embed": { MetabaseEmbed: any };
      };

      const { MetabaseEmbed } = windowWithEmbed["metabase.embed"];

      const embed = new MetabaseEmbed({
        url: iframePreviewUrl,
        target: iframeParentRef.current,
        apiKey,
      });

      return () => {
        embed.destroy();
      };
    }
  }, [isLoadingEmbedJs, iframePreviewUrl, apiKey]);

  if (isLoadingEmbedJs) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  return (
    <Center py="md">
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
            <Box
              ref={iframeParentRef}
              className={S.PreviewIframeContainer}
            ></Box>

            <Box mt="md">
              <Text mb="sm">
                Copy the following code snippet to your website:
              </Text>

              <Box p="md" className={S.CodeContainer}>
                <Code
                  style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}
                  bg="transparent"
                >
                  {iframeExampleSnippet}
                </Code>

                <CopyButton
                  value={iframeExampleSnippet}
                  className={S.CopyButton}
                />
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
                  value={embedMode}
                  onChange={value => {
                    if (value === "exploration") {
                      setEmbedMode("exploration");

                      return;
                    }

                    const resourceType = value as "dashboard" | "question";

                    const defaultResourceId = String(
                      resourceType === "dashboard"
                        ? DEFAULT_DASHBOARD_ID
                        : DEFAULT_QUESTION_ID,
                    );

                    setEmbedMode(resourceType);
                    setResourceId(defaultResourceId);
                  }}
                >
                  <Group>
                    <Radio value="dashboard" label="Dashboard" />
                    <Radio value="question" label="Question" />
                    <Radio value="exploration" label="Exploration" />
                  </Group>
                </Radio.Group>
              </Box>

              {embedMode !== "exploration" && (
                <Box mb="lg">
                  <Text mb="xs">{resourceName} ID</Text>
                  <TextInput
                    value={resourceId}
                    onChange={e => setResourceId(e.target.value)}
                    placeholder={`Enter ${embedMode} ID or Entity ID`}
                  />
                  <Text size="xs" c="text-secondary" mt="xs">
                    Can be a number or an Entity ID (21-character string)
                  </Text>
                </Box>
              )}

              {withApiKeyInput && (
                <Box mb="lg">
                  <Text mb="xs">API Key</Text>

                  <Group gap="xs">
                    <TextInput
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="Enter API key"
                      style={{ flex: 1 }}
                      rightSection={
                        allowGenerateApiKey && (
                          <ActionIcon
                            variant="outline"
                            onClick={handleCreateApiKey}
                            title="Create new API key"
                          >
                            <Icon name="key" size={16} c="brand" />
                          </ActionIcon>
                        )
                      }
                    />
                  </Group>

                  <Text size="xs" c="text-secondary" mt="xs" lh="md">
                    Paste an existing API key
                    {allowGenerateApiKey ? " or generate a new one" : ""}. You
                    must create a least privileged API key for public usage,
                    otherwise you risk exposing Metabase to unwanted access.
                  </Text>
                </Box>
              )}

              <Box>
                <Text size="lg" fw="bold" mb="md">
                  Theme Colors
                </Text>

                <Box mb="md">
                  <Text mb="xs">Brand Color</Text>
                  <ColorPicker
                    value={themeColors.brand}
                    onChange={handleColorChange("brand")}
                  />
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
