/* eslint-disable i18next/no-literal-string -- smoke app, not translated */
import {
  Button,
  Ellipsified,
  Group,
  Icon,
  Modal,
  QuarterPicker,
  Select,
  Stack,
  Text,
  ThemeProvider,
  Tooltip,
} from "@metabase/ui";

export const App = () => (
  <ThemeProvider>
    <Stack p="lg" gap="md" data-testid="page">
      <Group>
        <Button variant="filled" data-testid="button-filled">
          Filled
        </Button>
        <Icon name="table" size={24} data-testid="icon-table" />
      </Group>

      <Select label="Select" data={["One", "Two", "Three"]} />

      <Tooltip label="Tooltip label" opened position="right">
        <Button variant="default">Tooltip target</Button>
      </Tooltip>

      <div style={{ width: 120 }}>
        <Ellipsified alwaysShowTooltip>
          A long text that does not fit its container
        </Ellipsified>
      </div>

      <QuarterPicker quarterListFormat="[Q]Q [week] w · L" />

      <Modal opened onClose={() => undefined} title="Modal title">
        <Text>Modal body</Text>
      </Modal>
    </Stack>
  </ThemeProvider>
);
