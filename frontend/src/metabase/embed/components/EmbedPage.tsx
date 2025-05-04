import { useState } from "react";
import { ResizableBox } from "react-resizable";
import "react-resizable/css/styles.css";

import { Box, Button, Card, Group, Radio, Stack, Text } from "metabase/ui";

type EmbedType = "dashboard" | "chart" | "exploration";
type Step = "select-type" | "select-entity";

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

const PreviewSkeleton = ({ type }: { type: EmbedType }) => {
  switch (type) {
    case "dashboard":
      return (
        <Box>
          <Box h="40px" bg="bg-light" mb="md" />
          <Box h="200px" bg="bg-light" mb="md" />
          <Box h="200px" bg="bg-light" />
        </Box>
      );
    case "chart":
      return (
        <Box>
          <Box h="40px" bg="bg-light" mb="md" />
          <Box h="300px" bg="bg-light" />
        </Box>
      );
    case "exploration":
      return (
        <Box>
          <Box h="40px" bg="bg-light" mb="md" />
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

  const handleNext = () => {
    if (currentStep === "select-type") {
      setCurrentStep("select-entity");
    }
  };

  const handleBack = () => {
    if (currentStep === "select-entity") {
      setCurrentStep("select-type");
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
    } else {
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
              disabled={currentStep === "select-entity" && !selectedDashboard}
            >
              Next
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
            <PreviewSkeleton type={selectedType} />
          </Stack>
        </Card>
      </Box>
    </Box>
  );
};
