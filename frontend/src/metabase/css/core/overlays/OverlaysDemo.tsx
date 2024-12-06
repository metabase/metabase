import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  memo,
  useState,
} from "react";
import _ from "underscore";

import { EntityPickerModal } from "metabase/common/components/EntityPicker";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import LegacyModal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import Toaster from "metabase/components/Toaster";
import { UndoListOverlay, UndoToast } from "metabase/containers/UndoListing";
import LegacySelect, { Option } from "metabase/core/components/Select";
import TippyTooltip from "metabase/core/components/Tooltip";
import { PaletteCard } from "metabase/palette/components/Palette";
import {
  Box,
  Button,
  type ButtonProps,
  Flex,
  Group,
  HoverCard,
  Icon,
  Menu as MantineMenu,
  Modal as MantineModal,
  Popover as MantinePopover,
  Select as MantineSelect,
  Tooltip as MantineTooltip,
  type ModalProps,
  Paper,
  type PaperProps,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { createMockUndo } from "metabase-types/api/mocks";

import { BulkActionBarPortal } from "../../../components/BulkActionBar/BulkActionBar";

const LauncherGroup = ({
  title,
  children,
  ...props
}: { title: string } & PaperProps) => (
  <Paper {...props} p="md">
    <Stack spacing="md">
      <Title order={3}>{title}</Title>
      <Group noWrap={false}>{children}</Group>
    </Stack>
  </Paper>
);

const _Launchers = ({
  nestedLaunchers,
  setUndoCount,
  setToastCount,
  setActionToastCount,
  setLegacyModalCount,
  setMantineModalCount,
  setMantineModalWithTitlePropCount,
  setSidesheetCount,
  setEntityPickerCount,
  setCommandPaletteCount,
}: {
  nestedLaunchers: ReactNode;
  setUndoCount: Dispatch<SetStateAction<number>>;
  setToastCount: Dispatch<SetStateAction<number>>;
  setActionToastCount: Dispatch<SetStateAction<number>>;
  setLegacyModalCount: Dispatch<SetStateAction<number>>;
  setMantineModalCount: Dispatch<SetStateAction<number>>;
  setSidesheetCount: Dispatch<SetStateAction<number>>;
  setEntityPickerCount: Dispatch<SetStateAction<number>>;
  setCommandPaletteCount: Dispatch<SetStateAction<number>>;
  setMantineModalWithTitlePropCount: Dispatch<SetStateAction<number>>;
}) => {
  const mantinePopoverDropdownTitleId = _.uniqueId(
    "mantine-popover-dropdown-title",
  );

  return (
    <Group>
      <LauncherGroup title="Small overlays">
        <MantineTooltip label="Mantine Tooltip content">
          <Button>Mantine Tooltip</Button>
        </MantineTooltip>
        <MantinePopover>
          <MantinePopover.Target>
            <Button>Mantine Popover</Button>
          </MantinePopover.Target>
          <MantinePopover.Dropdown>
            <Paper
              p="md"
              maw="80vw"
              aria-labelledby={mantinePopoverDropdownTitleId}
            >
              <Title order={3} id={mantinePopoverDropdownTitleId}>
                Mantine Popover content
              </Title>
              Mantine Popover text content
              {nestedLaunchers}
            </Paper>
          </MantinePopover.Dropdown>
        </MantinePopover>
        <MantineMenu>
          <MantineMenu.Target>
            <Button>Mantine Menu</Button>
          </MantineMenu.Target>
          <MantineMenu.Dropdown>
            <MantineMenu.Item>Mantine Menu Item 1</MantineMenu.Item>
            <MantineMenu.Item>Mantine Menu Item 2</MantineMenu.Item>
            <MantineMenu.Divider />
            <MantineMenu.Item>Mantine Menu Item 3</MantineMenu.Item>
            <MantineMenu.Item>Mantine Menu Item 4</MantineMenu.Item>
          </MantineMenu.Dropdown>
        </MantineMenu>
        <HoverCard>
          <HoverCard.Target>
            <Button>Mantine HoverCard</Button>
          </HoverCard.Target>
          <HoverCard.Dropdown>
            <Paper p="md">Mantine HoverCard text content</Paper>
          </HoverCard.Dropdown>
        </HoverCard>
        <MantineSelect
          data={[
            {
              label: "Mantine Select option 1",
              value: "1",
            },
            {
              label: "Mantine Select option 2",
              value: "2",
            },
          ]}
          defaultValue={"1"}
        />
        <TippyTooltip tooltip="Legacy tooltip content">
          <Button>Legacy tooltip</Button>
        </TippyTooltip>
        <TippyPopover
          placement="bottom"
          content={
            <Paper p="md" aria-label="Legacy popover content">
              Legacy popover text content
              {nestedLaunchers}
            </Paper>
          }
        >
          <Button>Legacy popover</Button>
        </TippyPopover>
        <LegacySelect defaultValue="1" data-testid="LegacySelect">
          <Option value="1">Legacy Select option 1</Option>
          <Option value="2">Legacy Select option 2</Option>
        </LegacySelect>
      </LauncherGroup>
      <LauncherGroup title="Toasts">
        <Button onClick={() => setUndoCount(c => c + 1)}>
          Undo-style toast
        </Button>
        <Button onClick={() => setActionToastCount(c => c + 1)}>
          Action-style toast
        </Button>
        <Button onClick={() => setToastCount(c => c + 1)}>
          Toaster-style toast
        </Button>
      </LauncherGroup>
      <LauncherGroup title="Modals">
        <Button onClick={() => setMantineModalCount(c => c + 1)}>
          Mantine Modal
        </Button>
        <MantineTooltip label="This kind of modal sets its title via a prop">
          <Button onClick={() => setMantineModalWithTitlePropCount(c => c + 1)}>
            Mantine Modal variant
          </Button>
        </MantineTooltip>
        <Button onClick={() => setLegacyModalCount(c => c + 1)}>
          Legacy modal
        </Button>
        <Button onClick={() => setSidesheetCount(c => c + 1)}>Sidesheet</Button>
        <Button onClick={() => setEntityPickerCount(c => c + 1)}>
          Entity Picker
        </Button>
        <Button onClick={() => setCommandPaletteCount(c => c + 1)}>
          Command Palette
        </Button>
      </LauncherGroup>
    </Group>
  );
};

export type OverlaysDemoProps = {
  enableNesting: boolean;
};

export const OverlaysDemo = ({ enableNesting }: OverlaysDemoProps) => {
  const [legacyModalCount, setLegacyModalCount] = useState(0);
  const [mantineModalCount, setMantineModalCount] = useState(0);
  const [mantineModalWithTitlePropCount, setMantineModalWithTitlePropCount] =
    useState(0);
  const [toastCount, setToastCount] = useState(0);
  const [actionToastCount, setActionToastCount] = useState(0);
  const [sidesheetCount, setSidesheetCount] = useState(0);
  const [entityPickerCount, setEntityPickerCount] = useState(0);
  const [commandPaletteCount, setCommandPaletteCount] = useState(0);
  const [undoCount, setUndoCount] = useState(0);

  const Launchers = () => (
    <_Launchers
      setToastCount={setToastCount}
      setActionToastCount={setActionToastCount}
      setUndoCount={setUndoCount}
      setLegacyModalCount={setLegacyModalCount}
      setMantineModalCount={setMantineModalCount}
      setSidesheetCount={setSidesheetCount}
      setEntityPickerCount={setEntityPickerCount}
      setCommandPaletteCount={setCommandPaletteCount}
      setMantineModalWithTitlePropCount={setMantineModalWithTitlePropCount}
      nestedLaunchers={enableNesting ? <Launchers /> : <></>}
    />
  );

  return (
    <Stack p="lg">
      <Launchers />
      {undoCount > 0 && (
        <UndoListOverlay>
          <UndoToasts undoCount={undoCount} setUndoCount={setUndoCount} />
        </UndoListOverlay>
      )}
      {Array.from({ length: actionToastCount }).map((_, index) => (
        <BulkActionBarPortal
          key={`simple-bulk-action-bar-${index}`}
          opened
          isNavbarOpen={false}
          message="Action-style toast text content"
          aria-label="Action-style toast content"
          p="lg"
        >
          <CloseButton
            onClick={() => setActionToastCount(c => c - 1)}
            c="#fff"
            bg="transparent"
          />
          {enableNesting && <Launchers />}
        </BulkActionBarPortal>
      ))}
      {Array.from({ length: toastCount }).map((_, index) => (
        <Toaster
          key={`toaster-${index}`}
          message="Toaster-style toast text content"
          aria-label="Toaster-style toast content"
          confirmText="Confirm"
          isShown={true}
          onDismiss={() => {
            setToastCount(c => c - 1);
          }}
          onConfirm={() => {
            setToastCount(c => c - 1);
          }}
          className=""
          fixed
        />
      ))}
      {Array.from({ length: legacyModalCount }).map((_, index) => {
        const modalTitleId = `legacy-modal-title-${index}`;
        return (
          <LegacyModal
            isOpen
            key={`legacy-modal-${index}`}
            closeOnClickOutside
            onClose={() => setLegacyModalCount(c => c - 1)}
            aria-labelledby={modalTitleId}
          >
            <ModalContent>
              <Group style={{ position: "relative" }}>
                <Title p="md" order={3} id={modalTitleId}>
                  Legacy modal content
                </Title>
                <Stack spacing="md" p="md">
                  <Box p="1rem 0">Legacy modal text content</Box>
                  {enableNesting && <Launchers />}
                </Stack>
                <CloseButton onClick={() => setLegacyModalCount(c => c - 1)} />
              </Group>
            </ModalContent>
          </LegacyModal>
        );
      })}
      {Array.from({ length: mantineModalCount }).map((_, index) => (
        <SimpleModal
          key={`mantine-modal-${index}`}
          title={`Mantine Modal content`}
          onClose={() => setMantineModalCount(c => c - 1)}
        >
          <Stack spacing="md">
            <Text>Mantine Modal text content</Text>
            {enableNesting && <Launchers />}
          </Stack>
        </SimpleModal>
      ))}
      {Array.from({ length: mantineModalWithTitlePropCount }).map(
        (_, index) => (
          <MantineModal
            opened
            key={`mantine-modal-with-title-prop-${index}`}
            title="Mantine Modal content"
            onClose={() => setMantineModalWithTitlePropCount(c => c - 1)}
          >
            <Text>Mantine Modal text content</Text>
            {enableNesting && <Launchers />}
          </MantineModal>
        ),
      )}
      {Array.from({ length: sidesheetCount }).map((_, index) => (
        <Sidesheet
          key={`sidesheet-${index}`}
          isOpen
          onClose={() => setSidesheetCount(c => c - 1)}
          title="Sidesheet content"
        >
          Sidesheet text content
          {enableNesting && <Launchers />}
        </Sidesheet>
      ))}
      {Array.from({ length: entityPickerCount }).map((_, index) => (
        <EntityPickerModal
          key={`entity-picker-${index}`}
          title={`Entity Picker content`}
          selectedItem={null}
          canSelectItem={false}
          tabs={[]}
          onClose={() => {
            setEntityPickerCount(c => c - 1);
          }}
          onItemSelect={(_: any) => {}}
          onConfirm={() => {
            setEntityPickerCount(c => c - 1);
          }}
        >
          <Box p="lg">Entity Picker text content</Box>
          {enableNesting && (
            <Box p="lg">
              <Launchers />
            </Box>
          )}
        </EntityPickerModal>
      ))}
      {Array.from({ length: commandPaletteCount }).map((_, index) => {
        const modalTitleId = `command-palette-title-${index}`;
        return (
          <PaletteCard
            key={`command-palette-${index}`}
            onClick={() => {
              setCommandPaletteCount(c => c - 1);
            }}
            aria-labelledby={modalTitleId}
          >
            <div onClick={e => e.stopPropagation()}>
              <Flex p="lg">
                <Stack>
                  <Title id={modalTitleId} order={3}>
                    Command Palette content
                  </Title>
                  <Text>Command Palette text content</Text>
                  {enableNesting && <Launchers />}
                </Stack>
              </Flex>
            </div>
          </PaletteCard>
        );
      })}
    </Stack>
  );
};

const CloseButton = (props: ButtonProps) => {
  return (
    <Button
      pos="absolute"
      top={0}
      right={0}
      w="3rem"
      style={{ border: "none" }}
      {...props}
    >
      <Icon name="close" />
    </Button>
  );
};

const SimpleModal = ({
  title,
  children = "MantineModal body",
  ...props
}: Omit<ModalProps, "opened">) => (
  <MantineModal.Root {...props} opened size="70rem">
    <MantineModal.Overlay />
    <MantineModal.Content>
      <MantineModal.Header>
        {" "}
        <MantineModal.Title>{title}</MantineModal.Title>
        <MantineModal.CloseButton />
      </MantineModal.Header>
      <MantineModal.Body>{children}</MantineModal.Body>
    </MantineModal.Content>
  </MantineModal.Root>
);

const UndoToasts = memo(function UndoToasts({
  undoCount,
  setUndoCount,
}: {
  undoCount: number;
  setUndoCount: Dispatch<SetStateAction<number>>;
}) {
  return (
    <>
      {Array.from({ length: undoCount }).map((_, index) => (
        <UndoToast
          undo={createMockUndo({
            message: `Undo-style toast text content`,
          })}
          onUndo={() => {}}
          onDismiss={() => setUndoCount(c => c - 1)}
          key={`undo-toast-${index}`}
          aria-label="Undo-style toast content"
        />
      ))}
    </>
  );
});
