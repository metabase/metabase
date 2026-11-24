/* eslint-disable i18next/no-literal-string -- smoke app, not translated */
import {
  Box,
  Button,
  Ellipsified,
  Group,
  Icon,
  MetabaseUIProvider,
  Modal,
  QuarterPicker,
  Select,
  Stack,
  Text,
  Tooltip,
  color,
} from "@metabase/ui";
import { useState } from "react";

const colorScheme =
  new URLSearchParams(window.location.search).get("scheme") === "dark"
    ? "dark"
    : "light";

export const App = () => {
  const [modalOpened, setModalOpened] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const highOverlay = params.has("high-overlay");
  const tooltipOverride = params.has("tooltip-override")
    ? { Tooltip: { defaultProps: { zIndex: 11000 } } }
    : params.has("tooltip-callback")
      ? {
          Tooltip: {
            defaultProps: () => ({
              zIndex: 11000,
              "data-testid": "callback-tooltip",
            }),
          },
        }
      : undefined;
  return (
    <MetabaseUIProvider
      colorScheme={colorScheme}
      theme={
        highOverlay
          ? {
              other: { popover: { zIndex: 9999 } },
              components: tooltipOverride,
            }
          : undefined
      }
    >
      <Stack p="lg" gap="xl" data-testid="page">
        <Group>
          <Button variant="filled" data-testid="button-filled">
            Filled
          </Button>
          <Button
            variant="default"
            data-testid="open-modal"
            onClick={() => setModalOpened(true)}
          >
            Open modal
          </Button>
          <Icon name="table" size={24} data-testid="icon-table" />
        </Group>

        <Text data-testid="brand-color" style={{ color: color("core-brand") }}>
          {color("core-brand")}
        </Text>

        <Box w={120}>
          <Ellipsified>
            A very long text that does not fit in the box
          </Ellipsified>
        </Box>

        <Select
          label="Select"
          data={["One", "Two", "Three"]}
          data-testid="select"
          w={200}
        />

        <Tooltip label="Tooltip label" opened position="right">
          <Button variant="default" w={160} data-testid="tooltip-target">
            Tooltip target
          </Button>
        </Tooltip>

        <QuarterPicker
          data-testid="quarter-picker"
          quarterListFormat="[Q]Q [week] w · L"
          date="2024-01-01"
        />

        <Modal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          title="Modal title"
        >
          <Text>Modal body</Text>
          {highOverlay && (
            <Tooltip.Floating label="Floating tooltip">
              <Button>Floating tooltip target</Button>
            </Tooltip.Floating>
          )}
          {highOverlay && (
            <Tooltip label="Modal tooltip" opened position="top">
              <Button>Modal tooltip target</Button>
            </Tooltip>
          )}
        </Modal>
      </Stack>
    </MetabaseUIProvider>
  );
};
