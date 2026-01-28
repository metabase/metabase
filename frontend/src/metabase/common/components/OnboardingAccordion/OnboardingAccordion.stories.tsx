import { useState } from "react";

import { Box, Button, Stack, Text } from "metabase/ui";

import {
  OnboardingAccordion,
  type OnboardingAccordionProps,
} from "./OnboardingAccordion";

const args: OnboardingAccordionProps = {
  completedSteps: {},
  children: null,
};

const argTypes = {
  completedSteps: {
    control: { type: "object" },
  },
};

export default {
  title: "Components/OnboardingAccordion",
  component: OnboardingAccordion,
  args,
  argTypes,
};

const SamplePanel = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <Stack gap="lg">
    <Text>{description}</Text>
    <Box>
      <Button variant="filled">{title}</Button>
    </Box>
  </Stack>
);

export const Default = {
  name: "Default (no completed steps)",
  render: () => (
    <Box maw={600}>
      <OnboardingAccordion completedSteps={{}}>
        <OnboardingAccordion.Item value="step-1" icon="group">
          <OnboardingAccordion.Control>
            Enable multi-tenant user strategy
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Enable tenants"
              description="A tenant is a set of attributes assigned to a user to isolate them from other tenants. The main benefit is that you can reuse the same dashboards and permissions across all tenants."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>

        <OnboardingAccordion.Item value="step-2" icon="lock">
          <OnboardingAccordion.Control>
            Pick data segregation strategy
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Configure strategy"
              description="Choose how you want to segregate data between tenants."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>

        <OnboardingAccordion.Item value="step-3" icon="eye">
          <OnboardingAccordion.Control>
            Select data to make available
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Select data"
              description="Choose which tables and columns to expose to your tenants."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>

        <OnboardingAccordion.Item value="step-4" icon="globe">
          <OnboardingAccordion.Control>
            Configure tenants
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Add tenants"
              description="Create and configure your tenant definitions."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>
      </OnboardingAccordion>
    </Box>
  ),
};

export const WithCompletedSteps = {
  name: "With completed steps",
  render: () => (
    <Box maw={600}>
      <OnboardingAccordion
        completedSteps={{
          "step-1": true,
          "step-2": true,
          "step-3": false,
          "step-4": false,
        }}
      >
        <OnboardingAccordion.Item value="step-1" icon="group">
          <OnboardingAccordion.Control>
            Enable multi-tenant user strategy
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Enable tenants"
              description="A tenant is a set of attributes assigned to a user to isolate them from other tenants."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>

        <OnboardingAccordion.Item value="step-2" icon="lock">
          <OnboardingAccordion.Control>
            Pick data segregation strategy
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Configure strategy"
              description="Choose how you want to segregate data between tenants."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>

        <OnboardingAccordion.Item value="step-3" icon="eye">
          <OnboardingAccordion.Control>
            Select data to make available
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Select data"
              description="Choose which tables and columns to expose to your tenants."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>

        <OnboardingAccordion.Item value="step-4" icon="globe">
          <OnboardingAccordion.Control>
            Configure tenants
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Add tenants"
              description="Create and configure your tenant definitions."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>
      </OnboardingAccordion>
    </Box>
  ),
};

export const AllCompleted = {
  name: "All steps completed",
  render: () => (
    <Box maw={600}>
      <OnboardingAccordion
        completedSteps={{
          "step-1": true,
          "step-2": true,
          "step-3": true,
          "step-4": true,
        }}
      >
        <OnboardingAccordion.Item value="step-1" icon="group">
          <OnboardingAccordion.Control>
            Enable multi-tenant user strategy
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Enable tenants"
              description="A tenant is a set of attributes assigned to a user to isolate them from other tenants."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>

        <OnboardingAccordion.Item value="step-2" icon="lock">
          <OnboardingAccordion.Control>
            Pick data segregation strategy
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Configure strategy"
              description="Choose how you want to segregate data between tenants."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>

        <OnboardingAccordion.Item value="step-3" icon="eye">
          <OnboardingAccordion.Control>
            Select data to make available
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Select data"
              description="Choose which tables and columns to expose to your tenants."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>

        <OnboardingAccordion.Item value="step-4" icon="globe">
          <OnboardingAccordion.Control>
            Configure tenants
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
            <SamplePanel
              title="Add tenants"
              description="Create and configure your tenant definitions."
            />
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>
      </OnboardingAccordion>
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
    <Box maw={600}>
      <OnboardingAccordion completedSteps={completedSteps}>
        <OnboardingAccordion.Item value="step-1" icon="database">
          <OnboardingAccordion.Control>
            Connect to your database
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
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
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>

        <OnboardingAccordion.Item value="step-2" icon="group">
          <OnboardingAccordion.Control>
            Invite your team
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
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
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>

        <OnboardingAccordion.Item value="step-3" icon="dashboard">
          <OnboardingAccordion.Control>
            Create your first dashboard
          </OnboardingAccordion.Control>
          <OnboardingAccordion.Panel>
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
          </OnboardingAccordion.Panel>
        </OnboardingAccordion.Item>
      </OnboardingAccordion>
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
          "Click the buttons to mark steps as complete. The accordion will automatically open the next incomplete step.",
      },
    },
  },
};
