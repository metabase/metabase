import { useState } from "react";

import { Box, Button, Stack, Text } from "metabase/ui";

import {
  OnboardingStepper,
  type OnboardingStepperProps,
} from "./OnboardingStepper";

const args: OnboardingStepperProps = {
  completedSteps: {},
  lockedSteps: {},
  children: null,
};

const argTypes = {
  completedSteps: {
    control: { type: "object" },
  },
  lockedSteps: {
    control: { type: "object" },
  },
};

export default {
  title: "Components/OnboardingStepper",
  component: OnboardingStepper,
  args,
  argTypes,
};

const DefaultExample = () => {
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
      <OnboardingStepper completedSteps={completedSteps} lockedSteps={{}}>
        <OnboardingStepper.Step
          stepId="step-1"
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

        <OnboardingStepper.Step stepId="step-2" title="Invite your team">
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
          stepId="step-3"
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

export const Default = {
  render: () => <DefaultExample />,
  parameters: {
    docs: {
      description: {
        story:
          "Click the buttons to mark steps as complete. The stepper will automatically open the next incomplete step.",
      },
    },
  },
};

const LockedStepsExample = () => {
  return (
    <Box maw={600} ml="xl">
      <OnboardingStepper
        completedSteps={{ "step-1": true }}
        lockedSteps={{ "step-3": true, "step-4": true, "step-5": true }}
      >
        <OnboardingStepper.Step
          stepId="step-1"
          title="Add a database connection"
        >
          <Text>Connect your database to Metabase.</Text>
        </OnboardingStepper.Step>

        <OnboardingStepper.Step stepId="step-2" title="Configure SSO">
          <Text>Set up single sign-on for your team.</Text>
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="step-3"
          title="Select data to make available"
        >
          <Text>Choose which data to expose to your customers.</Text>
        </OnboardingStepper.Step>

        <OnboardingStepper.Step stepId="step-4" title="Create tenants">
          <Text>Set up tenants for multi-tenant embedding.</Text>
        </OnboardingStepper.Step>

        <OnboardingStepper.Step stepId="step-5" title="Summary">
          <Text>Review your setup.</Text>
        </OnboardingStepper.Step>
      </OnboardingStepper>
    </Box>
  );
};

export const LockedSteps = {
  render: () => <LockedStepsExample />,
  parameters: {
    docs: {
      description: {
        story:
          "Steps can be locked to indicate they are not yet available. A lock icon appears on the right side of locked steps.",
      },
    },
  },
};
