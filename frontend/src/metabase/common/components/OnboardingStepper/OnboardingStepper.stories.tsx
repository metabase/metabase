import { useState } from "react";

import { Box, Button, Stack, Text } from "metabase/ui";

import {
  OnboardingStepper,
  type OnboardingStepperProps,
} from "./OnboardingStepper";

const args: OnboardingStepperProps = {
  completedSteps: {},
  children: null,
};

const argTypes = {
  completedSteps: {
    control: { type: "object" },
  },
};

export default {
  title: "Components/OnboardingStepper",
  component: OnboardingStepper,
  args,
  argTypes,
};

const SampleContent = ({
  buttonText,
  description,
}: {
  buttonText: string;
  description: string;
}) => (
  <Stack gap="lg">
    <Text>{description}</Text>
    <Box>
      <Button variant="filled">{buttonText}</Button>
    </Box>
  </Stack>
);

export const Default = {
  name: "Default (no completed steps)",
  render: () => (
    <Box maw={600} ml="xl">
      <OnboardingStepper completedSteps={{}}>
        <OnboardingStepper.Step
          value="step-1"
          label={1}
          title="Enable multi-tenant user strategy"
        >
          <SampleContent
            buttonText="Enable tenants"
            description="A tenant is a set of attributes assigned to a user to isolate them from other tenants. The main benefit is that you can reuse the same dashboards and permissions across all tenants."
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          value="step-2"
          label={2}
          title="Pick data segregation strategy"
        >
          <SampleContent
            buttonText="Configure strategy"
            description="Choose how you want to segregate data between tenants."
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          value="step-3"
          label={3}
          title="Select data to make available"
        >
          <SampleContent
            buttonText="Select data"
            description="Choose which tables and columns to expose to your tenants."
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          value="step-4"
          label={4}
          title="Configure tenants"
        >
          <SampleContent
            buttonText="Add tenants"
            description="Create and configure your tenant definitions."
          />
        </OnboardingStepper.Step>
      </OnboardingStepper>
    </Box>
  ),
};

export const WithCompletedSteps = {
  name: "With completed steps",
  render: () => (
    <Box maw={600} ml="xl">
      <OnboardingStepper
        completedSteps={{
          "step-1": true,
          "step-2": true,
          "step-3": false,
          "step-4": false,
        }}
      >
        <OnboardingStepper.Step
          value="step-1"
          label={1}
          title="Enable multi-tenant user strategy"
        >
          <SampleContent
            buttonText="Enable tenants"
            description="A tenant is a set of attributes assigned to a user to isolate them from other tenants."
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          value="step-2"
          label={2}
          title="Pick data segregation strategy"
        >
          <SampleContent
            buttonText="Configure strategy"
            description="Choose how you want to segregate data between tenants."
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          value="step-3"
          label={3}
          title="Select data to make available"
        >
          <SampleContent
            buttonText="Select data"
            description="Choose which tables and columns to expose to your tenants."
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          value="step-4"
          label={4}
          title="Configure tenants"
        >
          <SampleContent
            buttonText="Add tenants"
            description="Create and configure your tenant definitions."
          />
        </OnboardingStepper.Step>
      </OnboardingStepper>
    </Box>
  ),
};

export const AllCompleted = {
  name: "All steps completed",
  render: () => (
    <Box maw={600} ml="xl">
      <OnboardingStepper
        completedSteps={{
          "step-1": true,
          "step-2": true,
          "step-3": true,
          "step-4": true,
        }}
      >
        <OnboardingStepper.Step
          value="step-1"
          label={1}
          title="Enable multi-tenant user strategy"
        >
          <SampleContent
            buttonText="Enable tenants"
            description="A tenant is a set of attributes assigned to a user to isolate them from other tenants."
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          value="step-2"
          label={2}
          title="Pick data segregation strategy"
        >
          <SampleContent
            buttonText="Configure strategy"
            description="Choose how you want to segregate data between tenants."
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          value="step-3"
          label={3}
          title="Select data to make available"
        >
          <SampleContent
            buttonText="Select data"
            description="Choose which tables and columns to expose to your tenants."
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          value="step-4"
          label={4}
          title="Configure tenants"
        >
          <SampleContent
            buttonText="Add tenants"
            description="Create and configure your tenant definitions."
          />
        </OnboardingStepper.Step>
      </OnboardingStepper>
    </Box>
  ),
};

const InteractiveExample = () => {
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>(
    {
      "step-1": false,
      "step-2": false,
      "step-3": false,
    },
  );

  const markComplete = (step: string) => {
    setCompletedSteps((prev) => ({ ...prev, [step]: true }));
  };

  return (
    <Box maw={600} ml="xl">
      <OnboardingStepper completedSteps={completedSteps}>
        <OnboardingStepper.Step
          value="step-1"
          label={1}
          title="Connect to your database"
        >
          <Stack gap="lg">
            <Text>
              Connect your database to start exploring your data. Metabase
              supports PostgreSQL, MySQL, and many other databases.
            </Text>
            <Box>
              <Button
                variant="filled"
                onClick={() => markComplete("step-1")}
                disabled={completedSteps["step-1"]}
              >
                {completedSteps["step-1"] ? "Connected!" : "Connect database"}
              </Button>
            </Box>
          </Stack>
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          value="step-2"
          label={2}
          title="Invite your team"
        >
          <Stack gap="lg">
            <Text>
              Invite colleagues to collaborate on dashboards and questions.
            </Text>
            <Box>
              <Button
                variant="filled"
                onClick={() => markComplete("step-2")}
                disabled={completedSteps["step-2"]}
              >
                {completedSteps["step-2"] ? "Invited!" : "Invite people"}
              </Button>
            </Box>
          </Stack>
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          value="step-3"
          label={3}
          title="Create your first dashboard"
        >
          <Stack gap="lg">
            <Text>
              Build a dashboard to visualize your data and share insights with
              your team.
            </Text>
            <Box>
              <Button
                variant="filled"
                onClick={() => markComplete("step-3")}
                disabled={completedSteps["step-3"]}
              >
                {completedSteps["step-3"]
                  ? "Dashboard created!"
                  : "Create dashboard"}
              </Button>
            </Box>
          </Stack>
        </OnboardingStepper.Step>
      </OnboardingStepper>
    </Box>
  );
};

export const Interactive = {
  name: "Interactive example",
  render: () => <InteractiveExample />,
  parameters: {
    docs: {
      description: {
        story:
          "Click the buttons to mark steps as complete. The stepper will automatically open the next incomplete step.",
      },
    },
  },
};
