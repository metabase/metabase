// trigger loki stress test
import { Alert, type AlertProps, Icon, Stack, Text } from "metabase/ui";

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

const DefaultTemplate = (args: AlertProps) => {
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

const WarningColorTemplate = (args: AlertProps) => {
  return (
    <Alert {...args} color="warning">
      <Text>
        In a future release, if a group’s View data access for a database (or
        any of its schemas or tables) is still set to No self-service
        (deprecated), Metabase will automatically change that group’s View data
        access for the entire database to Blocked.
      </Text>
    </Alert>
  );
};

const multiColor = (args: AlertProps) => {
  return (
    <Stack>
      <Alert {...args} color="info">
        <Text>
          In a future release, if a group’s View data access for a database (or
          any of its schemas or tables) is still set to No self-service
          (deprecated), Metabase will automatically change that group’s View
          data access for the entire database to Blocked.
        </Text>
      </Alert>
      <Alert {...args} color="warning">
        <Text>
          In a future release, if a group’s View data access for a database (or
          any of its schemas or tables) is still set to No self-service
          (deprecated), Metabase will automatically change that group’s View
          data access for the entire database to Blocked.
        </Text>
      </Alert>
      <Alert {...args} color="error">
        <Text>
          In a future release, if a group’s View data access for a database (or
          any of its schemas or tables) is still set to No self-service
          (deprecated), Metabase will automatically change that group’s View
          data access for the entire database to Blocked.
        </Text>
      </Alert>
      <Alert {...args} color="brand">
        <Text>
          In a future release, if a group’s View data access for a database (or
          any of its schemas or tables) is still set to No self-service
          (deprecated), Metabase will automatically change that group’s View
          data access for the entire database to Blocked.
        </Text>
      </Alert>
      <Alert {...args} color="success">
        <Text>
          In a future release, if a group’s View data access for a database (or
          any of its schemas or tables) is still set to No self-service
          (deprecated), Metabase will automatically change that group’s View
          data access for the entire database to Blocked.
        </Text>
      </Alert>
    </Stack>
  );
};

export default {
  title: "Components/Feedback/Alert",
  component: Alert,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const Warning = {
  render: WarningColorTemplate,
};

export const Light = {
  render: multiColor,
  args: {
    theme: "light",
  },
};

export const Dark = {
  render: multiColor,
  args: {
    theme: "dark",
  },
};
