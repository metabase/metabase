import { Alert, Icon, Text } from "metabase/ui";

const args = {
  icon: <Icon name="warning" />,
  title: "Bummer!",
  withCloseButton: false,
};

const argTypes = {
  color: {
    control: { type: "text" },
  },
  title: {
    control: { type: "text" },
  },
  withCloseButton: {
    control: { type: "toggle" },
  },
};

const DefaultTemplate = args => {
  return (
    <Alert {...args}>
      <Text>The No self-service access level for View data is going away.</Text>
      <Text>
        In a future release, if a group’s View data access for a database (or
        any of its schemas or tables) is still set to No self-service
        (deprecated), Metabase will automatically change that group’s View data
        access for the entire database to Blocked. We’ll be defaulting to
        Blocked, the least permissive View data access, to prevent any
        unattended access to data. Need help? See our docs.
      </Text>
    </Alert>
  );
};

export default {
  title: "Feedback/Alert",
  component: Alert,
  args: args,
  argTypes: argTypes,
};

export const Default_ = {
  render: DefaultTemplate,
  name: "Default",
};
