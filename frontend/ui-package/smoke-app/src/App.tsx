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
  useColorScheme,
} from "@metabase/ui";
import TableIcon from "@metabase/ui/icons/table";
import { useState } from "react";

const initialColorScheme =
  new URLSearchParams(window.location.search).get("scheme") === "dark"
    ? "dark"
    : "light";

const ColorSchemeControls = () => {
  const { resolvedColorScheme, setColorScheme, toggleColorScheme } =
    useColorScheme();
  return (
    <Group>
      <output aria-label="Resolved color scheme">{resolvedColorScheme}</output>
      <Button
        onClick={() => {
          setColorScheme("dark");
          toggleColorScheme();
        }}
      >
        Try changing scheme through the hook
      </Button>
    </Group>
  );
};

export const App = () => {
  const [colorScheme, setColorScheme] = useState<"light" | "dark">(
    initialColorScheme,
  );
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
      fontFamily={
        colorScheme === "dark"
          ? (params.get("dark-font") ?? undefined)
          : undefined
      }
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
          <TableIcon
            width={18}
            height={18}
            role="img"
            aria-label="Packed table icon"
          />
        </Group>

        {params.has("theme-controls") && (
          <Group>
            <Button
              onClick={() =>
                setColorScheme((scheme) =>
                  scheme === "light" ? "dark" : "light",
                )
              }
            >
              Change provider scheme
            </Button>
            <ColorSchemeControls />
          </Group>
        )}

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
            <Select label="Modal select" data={["Alpha", "Beta"]} />
          )}
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
