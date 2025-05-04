import { useState } from "react";
import { ResizableBox } from "react-resizable";
import "react-resizable/css/styles.css";

import {
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Radio,
  Stack,
  Switch,
  Text,
  TextInput,
} from "metabase/ui";

type EmbedType = "dashboard" | "chart" | "exploration";
type Step = "select-type" | "select-entity" | "configure";

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

const exampleDashboards = [
  {
    id: 1,
    name: "Sales Overview",
    description: "Key metrics and trends for sales performance",
    updatedAt: "2 hours ago",
  },
  {
    id: 2,
    name: "Customer Analytics",
    description: "Customer behavior and segmentation analysis",
    updatedAt: "1 day ago",
  },
  {
    id: 3,
    name: "Product Performance",
    description: "Product sales, inventory, and profitability metrics",
    updatedAt: "3 days ago",
  },
  {
    id: 4,
    name: "Marketing Campaigns",
    description: "Campaign performance and ROI tracking",
    updatedAt: "1 week ago",
  },
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

const PreviewSkeleton = ({
  type,
  showParameters,
}: {
  type: EmbedType;
  showParameters: boolean;
}) => {
  switch (type) {
    case "dashboard":
      return (
        <Box>
          <Box h="40px" bg="bg-light" mb="md" />
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
          <Box h="40px" bg="bg-light" mb="md" />
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
          <Box h="40px" bg="bg-light" mb="md" />
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

export const EmbedPage = () => {
  const [currentStep, setCurrentStep] = useState<Step>("select-type");
  const [selectedType, setSelectedType] = useState<EmbedType>("dashboard");
  const [selectedDashboard, setSelectedDashboard] = useState<number | null>(
    null,
  );
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [allowDrillThrough, setAllowDrillThrough] = useState(false);
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [parameterVisibility, setParameterVisibility] = useState<
    Record<string, boolean>
  >(
    exampleParameters.reduce(
      (acc, param) => ({ ...acc, [param.id]: true }),
      {},
    ),
  );

  const handleNext = () => {
    if (currentStep === "select-type") {
      setCurrentStep("select-entity");
    } else if (currentStep === "select-entity") {
      setCurrentStep("configure");
    }
  };

  const handleBack = () => {
    if (currentStep === "select-entity") {
      setCurrentStep("select-type");
    } else if (currentStep === "configure") {
      setCurrentStep("select-entity");
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
          <Text size="lg" fw="bold" mb="md">
            Select a dashboard to embed
          </Text>
          <Stack gap="md">
            {exampleDashboards.map((dashboard) => (
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
                }}
                onClick={() => setSelectedDashboard(dashboard.id)}
              >
                <Text fw="bold" mb="xs">
                  {dashboard.name}
                </Text>
                <Text size="sm" c="text-medium" mb="xs">
                  {dashboard.description}
                </Text>
                <Text size="xs" c="text-light">
                  Updated {dashboard.updatedAt}
                </Text>
              </Card>
            ))}
          </Stack>
        </Card>
      );
    } else {
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
              <Text size="lg" fw="bold">
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
                  />
                </Group>
              ))}
            </Stack>
          </Card>
        </Stack>
      );
    }
  };

  return (
    <Box style={{ display: "flex", height: "100vh" }}>
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
          }}
        >
          {renderStepContent()}
          <Group
            justify="space-between"
            style={{
              position: "absolute",
              bottom: "1rem",
              left: "1rem",
              right: "1rem",
            }}
          >
            <Button
              variant="default"
              onClick={handleBack}
              disabled={currentStep === "select-type"}
            >
              Back
            </Button>
            <Button
              variant="filled"
              onClick={handleNext}
              disabled={
                (currentStep === "select-entity" && !selectedDashboard) ||
                currentStep === "configure"
              }
            >
              {currentStep === "configure" ? "Finish" : "Next"}
            </Button>
          </Group>
        </Box>
      </ResizableBox>
      <Box style={{ flex: 1, padding: "1rem" }}>
        <Card p="md" h="100%">
          <Stack h="100%">
            <Text size="lg" fw="bold" mb="md">
              Preview
            </Text>
            <PreviewSkeleton
              type={selectedType}
              showParameters={Object.values(parameterVisibility).some(Boolean)}
            />
          </Stack>
        </Card>
      </Box>
    </Box>
  );
};
