import {
  Badge,
  Button,
  DatePicker,
  Icon,
  Menu,
  MetabaseUIProvider,
  Modal,
  Select,
  Stack,
  Group,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@metabase/ui";
import { useState } from "react";

type Scheme = "light" | "dark";

const getInitialScheme = (): Scheme =>
  new URLSearchParams(window.location.search).get("scheme") === "dark"
    ? "dark"
    : "light";

export const App = () => {
  const showModal =
    new URLSearchParams(window.location.search).get("modal") !== "0";
  const [scheme, setScheme] = useState<Scheme>(getInitialScheme);

  return (
    <MetabaseUIProvider colorScheme={scheme}>
      <Stack
        p="lg"
        gap="md"
        data-testid="page"
        style={{
          minHeight: "100vh",
          background: "var(--mb-color-background_page-primary)",
          color: "var(--mb-color-text-primary)",
        }}
      >
        <Button
          variant="default"
          data-testid="scheme-toggle"
          onClick={() => setScheme(scheme === "dark" ? "light" : "dark")}
        >
          Switch to {scheme === "dark" ? "light" : "dark"}
        </Button>

        <Text data-testid="text">Text in the primary colour</Text>
        <Badge data-testid="badge">Badge</Badge>

        <Group>
          <Button variant="filled" data-testid="button-filled">
            Filled
          </Button>
          <Button variant="light" data-testid="button-light">
            Light
          </Button>
          <Button variant="subtle" data-testid="button-subtle">
            Subtle
          </Button>
          <Button variant="default" data-testid="button-default">
            Default
          </Button>
        </Group>

        <Group data-testid="icons">
          <Icon name="table" data-testid="icon-table" size={24} />
          <Icon name="database" data-testid="icon-database" size={24} />
          <Icon name="search" data-testid="icon-search" size={24} />
        </Group>

        <Group>
          <Switch label="Checked" defaultChecked data-testid="switch-on" />
          <Switch label="Unchecked" data-testid="switch-off" />
        </Group>

        <TextInput
          label="Name"
          placeholder="Type here"
          data-testid="text-input"
        />

        <Menu opened>
          <Menu.Target>
            <Button variant="default" data-testid="menu-target">
              Menu
            </Button>
          </Menu.Target>
          <Menu.Dropdown data-testid="menu-dropdown">
            <Menu.Item>First</Menu.Item>
            <Menu.Item>Second</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Tooltip label="Tooltip label" opened position="right">
          <Button variant="default" data-testid="tooltip-target">
            Hover target
          </Button>
        </Tooltip>

        <DatePicker data-testid="date-picker" />

        <Select
          label="Select"
          data={["One", "Two", "Three"]}
          defaultDropdownOpened
          comboboxProps={{ withinPortal: false }}
          data-testid="select"
        />

        <Modal opened={showModal} onClose={() => undefined} title="Modal title">
          <Text data-testid="modal-text">Modal body</Text>
          <Select
            label="Modal select"
            data={["Alpha", "Beta", "Gamma"]}
            data-testid="modal-select"
          />
        </Modal>
      </Stack>
    </MetabaseUIProvider>
  );
};
