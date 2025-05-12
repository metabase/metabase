import { useEffect, useState } from "react";
import { ResizableBox } from "react-resizable";
import "react-resizable/css/styles.css";

import { DashboardPickerModal } from "metabase/common/components/DashboardPicker";
import { ColorPill } from "metabase/core/components/ColorPill";
import { colors } from "metabase/lib/colors";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Divider,
  Group,
  Icon,
  Radio,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";

type EmbedType = "dashboard" | "chart" | "exploration";
type Step = "select-type" | "select-entity" | "configure" | "get-code";
type ContentScenario = "self-made" | "no-content";

const embedTypes = [
  {
    value: "dashboard",
    title: "Dashboard",
    description: "Embed an entire dashboard with multiple charts and filters",
  },
  {
    value: "chart",
    title: "Chart",
    description: "Embed a single chart or visualization",
  },
  {
    value: "exploration",
    title: "Exploration",
    description: "Embed an interactive data exploration experience",
  },
];

const exampleDashboard = {
  id: 5,
  name: "Example Dashboard",
  description: "A sample dashboard showing various chart types and features",
  updatedAt: "2 weeks ago",
};

const exampleXRayDashboards = [
  {
    id: 101,
    name: "A look at your Orders",
    description: "Automatic insights about your order data",
    updatedAt: "Generated just now",
  },
  {
    id: 102,
    name: "A look at your Products",
    description: "Automatic insights about your product catalog",
    updatedAt: "Generated just now",
  },
  {
    id: 103,
    name: "A look at your Customers",
    description: "Automatic insights about your customer base",
    updatedAt: "Generated just now",
  },
];

const recentDashboards = [
  {
    id: 201,
    name: "Sales Performance 2024",
    description: "Tracking our quarterly sales targets and performance",
    updatedAt: "10 minutes ago",
  },
  {
    id: 202,
    name: "Customer Retention",
    description: "Monitoring customer churn and retention metrics",
    updatedAt: "2 hours ago",
  },
  {
    id: 203,
    name: "Marketing ROI",
    description: "Campaign performance and marketing spend analysis",
    updatedAt: "Yesterday",
  },
  {
    id: 204,
    name: "Product Analytics",
    description: "Usage patterns and feature adoption metrics",
    updatedAt: "2 days ago",
  },
  {
    id: 205,
    name: "Support Overview",
    description: "Customer support tickets and resolution times",
    updatedAt: "3 days ago",
  },
  exampleDashboard,
];

const exampleParameters = [
  {
    id: "date_range",
    name: "Date Range",
    placeholder: "Last 30 days",
  },
  {
    id: "region",
    name: "Region",
    placeholder: "All regions",
  },
  {
    id: "product_category",
    name: "Product Category",
    placeholder: "All categories",
  },
];

const exampleApiKey = "mb_6FlhSYBpxcDJJp4nXl41asr1di5IwQ7cFuuaXsBbNYY=";
// eslint-disable-next-line no-literal-metabase-strings -- This is an example URL for embedding
const exampleEmbedUrl = "https://simple-interactive-embedding-prototype.hosted.staging.metabase.com/embed/interactive/eyJlbWJlZFJlc291cmNlVHlwZSI6ImRhc2hib2FyZCIsImVtYmVkUmVzb3VyY2VJZCI6MSwidGhlbWUiOnsiY29sb3JzIjp7ImJhY2tncm91bmQiOiIjZmZmIiwidGV4dC1wcmltYXJ5IjoiIzRjNTc3MyIsInRleHQtc2Vjb25kYXJ5IjoiIzY5NmU3YiIsImJyYW5kIjoiIzUwOWVlMyJ9fX0=";

const PreviewSkeleton = ({
  type,
  showParameters,
  showTitle,
}: {
  type: EmbedType;
  showParameters: boolean;
  showTitle: boolean;
}) => {
  switch (type) {
    case "dashboard":
      return (
        <Box>
          {showTitle && <Box h="40px" bg="bg-light" mb="md" />}
          {showParameters && (
            <Box
              h="60px"
              bg="bg-light"
              mb="md"
              style={{ display: "flex", gap: "1rem", padding: "1rem" }}
            >
              {exampleParameters.map((param) => (
                <Box key={param.id} h="100%" w="200px" bg="bg-medium" />
              ))}
            </Box>
          )}
          <Box h="200px" bg="bg-light" mb="md" />
          <Box h="200px" bg="bg-light" />
        </Box>
      );
    case "chart":
      return (
        <Box>
          {showTitle && <Box h="40px" bg="bg-light" mb="md" />}
          {showParameters && (
            <Box
              h="60px"
              bg="bg-light"
              mb="md"
              style={{ display: "flex", gap: "1rem", padding: "1rem" }}
            >
              {exampleParameters.map((param) => (
                <Box key={param.id} h="100%" w="200px" bg="bg-medium" />
              ))}
            </Box>
          )}
          <Box h="300px" bg="bg-light" />
        </Box>
      );
    case "exploration":
      return (
        <Box>
          {showTitle && <Box h="40px" bg="bg-light" mb="md" />}
          {showParameters && (
            <Box
              h="60px"
              bg="bg-light"
              mb="md"
              style={{ display: "flex", gap: "1rem", padding: "1rem" }}
            >
              {exampleParameters.map((param) => (
                <Box key={param.id} h="100%" w="200px" bg="bg-medium" />
              ))}
            </Box>
          )}
          <Box h="200px" bg="bg-light" mb="md" />
          <Box h="40px" bg="bg-light" />
        </Box>
      );
  }
};

const ColorSwatch = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (color?: string) => void;
}) => {
  return (
    <ColorPill
      color={value}
      onClick={() => {
        const newColor = prompt("Enter a color (hex, rgb, or name):");
        if (newColor) {
          onChange(newColor);
        }
      }}
    />
  );
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

const serializeState = (state: {
  type: EmbedType;
  dashboard: number | null;
  allowDrillThrough: boolean;
  allowDownloads: boolean;
  showTitle: boolean;
  brandColor: string;
  textColor: string;
  backgroundColor: string;
  parameterVisibility: Record<string, boolean>;
}) => {
  return btoa(JSON.stringify(state));
};

const deserializeState = (encoded: string) => {
  try {
    return JSON.parse(atob(encoded));
  } catch {
    return null;
  }
};

export const EmbedPage = () => {
  const [currentStep, setCurrentStep] = useState<Step>("select-type");
  const [selectedType, setSelectedType] = useState<EmbedType>("dashboard");
  const [selectedDashboard, setSelectedDashboard] = useState<number | null>(201);
  const [contentScenario, setContentScenario] = useState<ContentScenario>("self-made");
  const [isCalloutExpanded, setIsCalloutExpanded] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [allowDrillThrough, setAllowDrillThrough] = useState(false);
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [showTitle, setShowTitle] = useState(true);
  const [brandColor, setBrandColor] = useState(colors.brand);
  const [textColor, setTextColor] = useState(colors["text-dark"]);
  const [backgroundColor, setBackgroundColor] = useState(colors.white);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [parameterVisibility, setParameterVisibility] = useState<Record<string, boolean>>(
    exampleParameters.reduce((acc, param) => ({ ...acc, [param.id]: true }), {}),
  );

  // Update URL whenever configuration changes
  useEffect(() => {
    const state = {
      type: selectedType,
      dashboard: selectedDashboard,
      allowDrillThrough,
      allowDownloads,
      showTitle,
      brandColor,
      textColor,
      backgroundColor,
      parameterVisibility,
    };
    const encoded = serializeState(state);
    const url = new URL(window.location.href);
    url.searchParams.set("state", encoded);
    window.history.replaceState({}, "", url);
  }, [
    selectedType,
    selectedDashboard,
    allowDrillThrough,
    allowDownloads,
    showTitle,
    brandColor,
    textColor,
    backgroundColor,
    parameterVisibility,
  ]);

  // Load state from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get("state");
    if (state) {
      const decoded = deserializeState(state);
      if (decoded) {
        setSelectedType(decoded.type);
        setSelectedDashboard(decoded.dashboard);
        setAllowDrillThrough(decoded.allowDrillThrough);
        setAllowDownloads(decoded.allowDownloads);
        setShowTitle(decoded.showTitle);
        setBrandColor(decoded.brandColor);
        setTextColor(decoded.textColor);
        setBackgroundColor(decoded.backgroundColor);
        setParameterVisibility(decoded.parameterVisibility);
        setCurrentStep("get-code");
      }
    }
  }, []);

  const handleNext = () => {
    if (currentStep === "select-type") {
      setCurrentStep("select-entity");
    } else if (currentStep === "select-entity") {
      setCurrentStep("configure");
    } else if (currentStep === "configure") {
      setCurrentStep("get-code");
    }
  };

  const handleBack = () => {
    if (currentStep === "select-entity") {
      setCurrentStep("select-type");
    } else if (currentStep === "configure") {
      setCurrentStep("select-entity");
    } else if (currentStep === "get-code") {
      setCurrentStep("configure");
    }
  };

  const renderStepContent = () => {
    if (currentStep === "select-type") {
      return (
        <Card p="md" mb="md">
          <Text size="lg" fw="bold" mb="md">
            Select your embed experience
          </Text>
          <Radio.Group
            value={selectedType}
            onChange={(value) => setSelectedType(value as EmbedType)}
          >
            <Stack gap="md">
              {embedTypes.map((type) => (
                <Radio
                  key={type.value}
                  value={type.value}
                  label={type.title}
                  description={type.description}
                />
              ))}
            </Stack>
          </Radio.Group>
        </Card>
      );
    } else if (currentStep === "select-entity") {
      return (
        <Card p="md" mb="md">
          <Group justify="space-between" mb="md">
            <Text size="lg" fw="bold">
              Select a dashboard to embed
            </Text>
            <ActionIcon
              variant="outline"
              size="lg"
              onClick={() => setIsPickerOpen(true)}
              title="Browse dashboards"
            >
              <Icon name="search" size={16} />
            </ActionIcon>
          </Group>
          <Text size="sm" c="text-medium" mb="md">
            {contentScenario === "self-made"
              ? "Your recent dashboards"
              : "Start quickly with automatic insights"
            }
          </Text>
          <Stack gap="md">
            {contentScenario === "self-made"
              ? recentDashboards.slice(0, -1).map((dashboard) => (
                <Card
                  key={dashboard.id}
                  p="md"
                  withBorder
                  style={{
                    cursor: "pointer",
                    backgroundColor:
                      selectedDashboard === dashboard.id
                        ? "var(--mb-color-bg-light)"
                        : undefined,
                    borderColor:
                      selectedDashboard === dashboard.id
                        ? "var(--mb-color-brand)"
                        : undefined,
                    borderWidth:
                      selectedDashboard === dashboard.id
                        ? "2px"
                        : undefined,
                  }}
                  onClick={() => setSelectedDashboard(dashboard.id)}
                >
                  <Group align="start" gap="sm">
                    <Icon name="dashboard" size={20} color={colors.brand} />
                    <Stack gap="xs" style={{ flex: 1 }}>
                      <Text fw="bold">
                        {dashboard.name}
                      </Text>
                      <Text size="sm" c="text-medium">
                        {dashboard.description}
                      </Text>
                      <Text size="xs" c="text-light">
                        Updated {dashboard.updatedAt}
                      </Text>
                    </Stack>
                  </Group>
                </Card>
              ))
              : exampleXRayDashboards.map((dashboard) => (
                <Card
                  key={dashboard.id}
                  p="md"
                  withBorder
                  style={{
                    cursor: "pointer",
                    backgroundColor:
                      selectedDashboard === dashboard.id
                        ? "var(--mb-color-bg-light)"
                        : undefined,
                    borderColor:
                      selectedDashboard === dashboard.id
                        ? "var(--mb-color-brand)"
                        : undefined,
                    borderWidth:
                      selectedDashboard === dashboard.id
                        ? "2px"
                        : undefined,
                  }}
                  onClick={() => setSelectedDashboard(dashboard.id)}
                >
                  <Group align="start" gap="sm">
                    <Icon name="bolt" size={20} color={colors.accent7} />
                    <Stack gap="xs" style={{ flex: 1 }}>
                      <Text fw="bold">
                        {dashboard.name}
                      </Text>
                      <Text size="sm" c="text-medium">
                        {dashboard.description}
                      </Text>
                      <Text size="xs" c="text-light">
                        Updated {dashboard.updatedAt}
                      </Text>
                    </Stack>
                  </Group>
                </Card>
              ))
            }
            <Divider label="Or try" labelPosition="center" />
            <Card
              key={exampleDashboard.id}
              p="md"
              withBorder
              style={{
                cursor: "pointer",
                backgroundColor:
                  selectedDashboard === exampleDashboard.id
                    ? "var(--mb-color-bg-light)"
                    : undefined,
                borderColor:
                  selectedDashboard === exampleDashboard.id
                    ? "var(--mb-color-brand)"
                    : undefined,
                borderWidth:
                  selectedDashboard === exampleDashboard.id
                    ? "2px"
                    : undefined,
              }}
              onClick={() => setSelectedDashboard(exampleDashboard.id)}
            >
              <Group align="start" gap="sm">
                <Icon name="dashboard" size={20} color={colors.brand} />
                <Stack gap="xs" style={{ flex: 1 }}>
                  <Text fw="bold">
                    {exampleDashboard.name}
                  </Text>
                  <Text size="sm" c="text-medium">
                    {exampleDashboard.description}
                  </Text>
                  <Text size="xs" c="text-light">
                    Updated {exampleDashboard.updatedAt}
                  </Text>
                </Stack>
              </Group>
            </Card>
          </Stack>
          {isPickerOpen && (
            <DashboardPickerModal
              title="Select a dashboard"
              value={selectedDashboard ? { id: selectedDashboard, model: "dashboard" } : undefined}
              onChange={item => {
                setSelectedDashboard(typeof item.id === 'string' ? parseInt(item.id, 10) : item.id);
                setIsPickerOpen(false);
              }}
              onClose={() => setIsPickerOpen(false)}
              options={{
                showPersonalCollections: true,
                showRootCollection: true,
                hasConfirmButtons: false,
              }}
            />
          )}
        </Card>
      );
    } else if (currentStep === "configure") {
      return (
        <Stack gap="md">
          <Card p="md">
            <Text size="lg" fw="bold" mb="md">
              Behavior
            </Text>
            <Stack gap="md">
              <Checkbox
                label="Allow users to drill through on data points"
                checked={allowDrillThrough}
                onChange={(e) => setAllowDrillThrough(e.target.checked)}
              />
              <Checkbox
                label="Allow downloads"
                checked={allowDownloads}
                onChange={(e) => setAllowDownloads(e.target.checked)}
              />
            </Stack>
          </Card>

          <Card p="md">
            <Group justify="space-between" mb="md">
              <Text size="lg" fw="bold">
                Parameters
              </Text>
              <Text size="sm" fw="bold">
                Visibility
              </Text>
            </Group>
            <Stack gap="md">
              {exampleParameters.map((param) => (
                <Group key={param.id} justify="space-between" align="center">
                  <TextInput
                    label={param.name}
                    placeholder={param.placeholder}
                    style={{ flex: 1 }}
                  />
                  <Switch
                    checked={parameterVisibility[param.id]}
                    onChange={(e) =>
                      setParameterVisibility({
                        ...parameterVisibility,
                        [param.id]: e.target.checked,
                      })
                    }
                    size="sm"
                  />
                </Group>
              ))}
            </Stack>
          </Card>

          <Card p="md">
            <Text size="lg" fw="bold" mb="md">
              Appearance
            </Text>
            <Group align="start" gap="xl">
              <Stack gap="xs" align="start">
                <Text size="sm" fw="bold">
                  Brand Color
                </Text>
                <ColorSwatch
                  value={brandColor}
                  onChange={(color?: string) => color && setBrandColor(color)}
                />
              </Stack>
              <Stack gap="xs" align="start">
                <Text size="sm" fw="bold">
                  Text Color
                </Text>
                <ColorSwatch
                  value={textColor}
                  onChange={(color?: string) => color && setTextColor(color)}
                />
              </Stack>
              <Stack gap="xs" align="start">
                <Text size="sm" fw="bold">
                  Background
                </Text>
                <ColorSwatch
                  value={backgroundColor}
                  onChange={(color?: string) =>
                    color && setBackgroundColor(color)
                  }
                />
              </Stack>
            </Group>
            <Checkbox
              label="Show dashboard title"
              checked={showTitle}
              onChange={(e) => setShowTitle(e.target.checked)}
              mt="md"
            />
          </Card>
        </Stack>
      );
    } else {
      return (
        <Stack gap="md">
          <Card p="md">
            <Text size="lg" fw="bold" mb="md">
              Authentication
            </Text>
            <Text size="sm" c="text-medium" mb="md">
              {/* eslint-disable-next-line no-literal-metabase-strings -- This is an example message for admins */}
              This API key is for demonstration purposes only. In production, you should create a least privileged and sandboxed API key to prevent unwanted access to your Metabase instance.
            </Text>
            <TextInput
              value={exampleApiKey}
              readOnly
              rightSection={
                <ActionIcon
                  onClick={() => copyToClipboard(exampleApiKey)}
                  variant="subtle"
                >
                  <Icon name="copy" size={16} />
                </ActionIcon>
              }
            />
          </Card>

          <Card p="md">
            <Text size="lg" fw="bold" mb="md">
              Embed Code
            </Text>
            <Stack gap="xs">
              <Code block>
                {/* eslint-disable-next-line no-literal-metabase-strings -- This is an example code snippet for admins */}
                {`<script src="https://simple-interactive-embedding-prototype.hosted.staging.metabase.com/app/embed.js"></script>

<div id="metabase-embed-container"></div>

<script>
  const { MetabaseEmbed } = window["metabase.embed"];

  const embed = new MetabaseEmbed({
    target: "#metabase-embed-container",

    // IMPORTANT: You must create a least privileged and sandboxed API key for
    // public usage. Otherwise, you risk exposing Metabase to unwanted access.
    apiKey: "${exampleApiKey}",

    url: "${exampleEmbedUrl}"
  });
</script>`}
              </Code>
              <Button
                leftSection={<Icon name="copy" size={16} />}
                onClick={() => copyToClipboard(`<script src="https://simple-interactive-embedding-prototype.hosted.staging.metabase.com/app/embed.js"></script>

<div id="metabase-embed-container"></div>

<script>
  const { MetabaseEmbed } = window["metabase.embed"];

  const embed = new MetabaseEmbed({
    target: "#metabase-embed-container",

    // IMPORTANT: You must create a least privileged and sandboxed API key for
    // public usage. Otherwise, you risk exposing Metabase to unwanted access.
    apiKey: "${exampleApiKey}",

    url: "${exampleEmbedUrl}"
  });
</script>`)}
              >
                Copy Code
              </Button>
            </Stack>
          </Card>
        </Stack>
      );
    }
  };

  return (
    <Box
      style={{
        display: "flex",
        height: "calc(100vh - 4rem)",
        overflow: "hidden",
        position: "fixed",
        top: "4rem",
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <ResizableBox
        width={sidebarWidth}
        height={Infinity}
        minConstraints={[300, Infinity]}
        maxConstraints={[600, Infinity]}
        onResizeStop={(_, data) => setSidebarWidth(data.size.width)}
        axis="x"
        handle={
          <Box
            style={{
              width: "4px",
              height: "100%",
              cursor: "col-resize",
              backgroundColor: "var(--mb-color-border)",
              position: "absolute",
              right: 0,
              top: 0,
            }}
          />
        }
      >
        <Box
          style={{
            height: "100%",
            borderRight: "1px solid var(--mb-color-border)",
            padding: "1rem",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Box style={{ flex: 1, overflowY: "auto", paddingBottom: "4rem" }}>
            {renderStepContent()}
          </Box>
          <Group
            justify="space-between"
            style={{
              position: "absolute",
              bottom: "1rem",
              left: "1rem",
              right: "1rem",
              backgroundColor: "var(--mb-color-bg-white)",
              padding: "0.5rem",
              borderTop: "1px solid var(--mb-color-border)",
            }}
          >
            <Button
              variant="default"
              onClick={handleBack}
              disabled={currentStep === "select-type"}
            >
              Back
            </Button>
            {currentStep !== "get-code" && (
              <Button
                variant="filled"
                onClick={handleNext}
                disabled={currentStep === "select-entity" && !selectedDashboard}
              >
                {currentStep === "configure" ? "Get Code" : "Next"}
              </Button>
            )}
          </Group>
        </Box>
      </ResizableBox>
      <Box style={{ flex: 1, padding: "1rem", overflow: "hidden" }}>
        <Card p="md" h="100%">
          <Stack h="100%">
            <Text size="lg" fw="bold" mb="md">
              {selectedDashboard ?
                [...recentDashboards, ...exampleXRayDashboards].find(d => d.id === selectedDashboard)?.name || "Preview"
                : "Preview"
              }
            </Text>
            <PreviewSkeleton
              type={selectedType}
              showParameters={Object.values(parameterVisibility).some(Boolean)}
              showTitle={showTitle}
            />
          </Stack>
        </Card>
      </Box>
      {currentStep === "select-entity" && (
        isCalloutExpanded ? (
          <Card
            p="md"
            style={{
              position: "fixed",
              bottom: "2rem",
              right: "2rem",
              width: "300px",
              zIndex: 1,
            }}
          >
            <Group justify="space-between" mb="md">
              <Text size="sm" fw="bold">
                Content Scenario
              </Text>
              <ActionIcon
                variant="subtle"
                onClick={() => setIsCalloutExpanded(false)}
                title="Minimize"
              >
                <Icon name="close" size={16} />
              </ActionIcon>
            </Group>
            <Radio.Group
              value={contentScenario}
              onChange={(value) => setContentScenario(value as ContentScenario)}
            >
              <Stack gap="xs">
                <Radio
                  value="self-made"
                  label="User has dashboards"
                  description="Shows recent dashboards + example"
                />
                <Radio
                  value="no-content"
                  label="User has no content"
                  description="Shows x-ray insights + example"
                />
              </Stack>
            </Radio.Group>
          </Card>
        ) : (
          <Tooltip
            label="Design callout"
            position="top"
            withArrow
          >
            <Box style={{ position: "fixed", bottom: "2rem", right: "2rem", zIndex: 1 }}>
              <Badge
                size="sm"
                variant="filled"
                style={{
                  position: "absolute",
                  top: "-8px",
                  right: "-8px",
                  zIndex: 2,
                  backgroundColor: colors["text-dark"],
                  color: colors.white
                }}
              >
                1
              </Badge>
              <ActionIcon
                variant="filled"
                size="xl"
                radius="xl"
                style={{
                  boxShadow: `0 4px 14px ${colors.shadow}`
                }}
                onClick={() => setIsCalloutExpanded(true)}
              >
                <img
                  src="/app/assets/img/kyle.png"
                  alt="Content scenarios"
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    display: "block"
                  }}
                />
              </ActionIcon>
            </Box>
          </Tooltip>
        )
      )}
    </Box>
  );
};
