import { type Dispatch, type SetStateAction, memo, useState } from "react";

import { EntityPickerModal } from "metabase/common/components/EntityPicker";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import LegacyModal from "metabase/components/Modal";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import Toaster from "metabase/components/Toaster";
import { FloatingUndoList, UndoToast } from "metabase/containers/UndoListing";
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
  Tooltip as MantineTooltip,
  type ModalProps,
  Paper,
  type PaperProps,
  Select,
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
  nested,
  setUndoCount,
  setToastCount,
  setActionToastCount,
  setLegacyModalCount,
  setMantineModalCount,
  setSidesheetCount,
  setEntityPickerCount,
  setCommandPaletteCount,
}: {
  nested?: boolean;
  setUndoCount: Dispatch<SetStateAction<number>>;
  setToastCount: Dispatch<SetStateAction<number>>;
  setActionToastCount: Dispatch<SetStateAction<number>>;
  setLegacyModalCount: Dispatch<SetStateAction<number>>;
  setMantineModalCount: Dispatch<SetStateAction<number>>;
  setSidesheetCount: Dispatch<SetStateAction<number>>;
  setEntityPickerCount: Dispatch<SetStateAction<number>>;
  setCommandPaletteCount: Dispatch<SetStateAction<number>>;
}) => {
  const note = nested ? " (nested)" : "";
  return (
    <Group>
      <LauncherGroup title="Small floating elements">
        <MantineTooltip label={"Tooltip content" + note}>
          <Button w="20rem">Mantine Tooltip {note}</Button>
        </MantineTooltip>
        <MantinePopover>
          <MantinePopover.Target>
            <Button w="20rem">Mantine Popover {note}</Button>
          </MantinePopover.Target>
          <MantinePopover.Dropdown>
            <Paper p="md">Popover content {note}</Paper>
          </MantinePopover.Dropdown>
        </MantinePopover>
        <MantineMenu>
          <MantineMenu.Target>
            <Button>Mantine Menu {note}</Button>
          </MantineMenu.Target>
          <MantineMenu.Dropdown>
            <MantineMenu.Item>Item 1</MantineMenu.Item>
            <MantineMenu.Item>Item 2</MantineMenu.Item>
            <MantineMenu.Divider />
            <MantineMenu.Item>Item 3</MantineMenu.Item>
            <MantineMenu.Item>Item 4</MantineMenu.Item>
          </MantineMenu.Dropdown>
        </MantineMenu>
        <HoverCard>
          <HoverCard.Target>
            <Button>Mantine HoverCard {note}</Button>
          </HoverCard.Target>
          <HoverCard.Dropdown>
            <Paper p="md">HoverCard content {note}</Paper>
          </HoverCard.Dropdown>
        </HoverCard>
        <TippyTooltip tooltip={"Tooltip content" + note}>
          <Button w="20rem">Legacy Tooltip {note}</Button>
        </TippyTooltip>
        <TippyPopover content={<Paper p="md">Popover content {note}</Paper>}>
          <Button w="20rem">Legacy popover {note} </Button>
        </TippyPopover>
        <Select
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
      </LauncherGroup>
      <LauncherGroup title="Toasts">
        <Button onClick={() => setUndoCount(c => c + 1)}>
          Undo-style toast
        </Button>
        <Button onClick={() => setActionToastCount(c => c + 1)}>
          Action-style toast
        </Button>
        <Button onClick={() => setToastCount(c => c + 1)}>
          Toaster-style Toast
        </Button>
      </LauncherGroup>
      <LauncherGroup title="Modals">
        <Button onClick={() => setMantineModalCount(c => c + 1)}>
          Mantine modal
        </Button>
        <Button onClick={() => setLegacyModalCount(c => c + 1)}>
          Legacy modal
        </Button>
        <Button onClick={() => setSidesheetCount(c => c + 1)}>Sidesheet</Button>
        <Button onClick={() => setEntityPickerCount(c => c + 1)}>
          Entity Picker
        </Button>
        <Button onClick={() => setCommandPaletteCount(c => c + 1)}>
          Command Palette Modal
        </Button>
      </LauncherGroup>
    </Group>
  );
};

export const FloatingElementsDemo = ({
  enableNesting,
}: {
  enableNesting: boolean;
}) => {
  const [legacyModalCount, setLegacyModalCount] = useState(0);
  const [mantineModalCount, setMantineModalCount] = useState(0);
  const [toastCount, setToastCount] = useState(0);
  const [actionToastCount, setActionToastCount] = useState(0);
  const [sidesheetCount, setSidesheetCount] = useState(0);
  const [entityPickerCount, setEntityPickerCount] = useState(0);
  const [commandPaletteCount, setCommandPaletteCount] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const Launchers = ({ nested }: { nested?: boolean }) => (
    <_Launchers
      setToastCount={setToastCount}
      setActionToastCount={setActionToastCount}
      setUndoCount={setUndoCount}
      setLegacyModalCount={setLegacyModalCount}
      setMantineModalCount={setMantineModalCount}
      setSidesheetCount={setSidesheetCount}
      setEntityPickerCount={setEntityPickerCount}
      setCommandPaletteCount={setCommandPaletteCount}
      nested={nested}
    />
  );

  return (
    <Stack p="lg">
      <Launchers />
      {undoCount > 0 && (
        <FloatingUndoList>
          <UndoToasts undoCount={undoCount} setUndoCount={setUndoCount} />
        </FloatingUndoList>
      )}
      {Array.from({ length: actionToastCount }).map((_, index) => (
        <BulkActionBarPortal
          key={`simple-bulk-action-bar-${index}`}
          opened
          message="Toast message"
          isNavbarOpen={false}
          p="lg"
        >
          <CloseButton
            onClick={() => setActionToastCount(c => c - 1)}
            c="#fff"
            bg="transparent"
          />
          {enableNesting && <Launchers nested />}
        </BulkActionBarPortal>
      ))}
      {Array.from({ length: toastCount }).map((_, index) => (
        <Toaster
          key={`toaster-${index}`}
          message="Toaster-style toast content"
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
      {Array.from({ length: legacyModalCount }).map((_, index) => (
        <LegacyModal isOpen key={`legacy-modal-${index}`}>
          <Group style={{ position: "relative" }}>
            <Stack spacing="md" p="md">
              <Box p="1rem 0">Legacy modal content</Box>
              {enableNesting && <Launchers nested />}
            </Stack>
            <CloseButton onClick={() => setLegacyModalCount(c => c - 1)} />
          </Group>
        </LegacyModal>
      ))}
      {Array.from({ length: mantineModalCount }).map((_, index) => (
        <SimpleModal
          key={`mantine-modal-${index}`}
          title={`Mantine modal`}
          onClose={() => setMantineModalCount(c => c - 1)}
        >
          <Stack spacing="md">
            <Text>Mantine modal content</Text>
            {enableNesting && <Launchers nested />}
          </Stack>
        </SimpleModal>
      ))}
      {Array.from({ length: sidesheetCount }).map((_, index) => (
        <Sidesheet
          key={`sidesheet-${index}`}
          isOpen
          onClose={() => setSidesheetCount(c => c - 1)}
        >
          Sidesheet content
          {enableNesting && <Launchers nested />}
        </Sidesheet>
      ))}
      {Array.from({ length: entityPickerCount }).map((_, index) => (
        <EntityPickerModal
          key={`entity-picker-${index}`}
          title={`Entity Picker`}
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
        />
      ))}
      {Array.from({ length: commandPaletteCount }).map((_, index) => (
        <PaletteCard
          key={`command-palette-${index}`}
          onClick={() => {
            setCommandPaletteCount(c => c - 1);
          }}
        >
          <div onClick={e => e.stopPropagation()}>
            <Flex p="lg">
              <Stack>
                <Text>Command Palette modal content</Text>
                {enableNesting && <Launchers nested />}
              </Stack>
            </Flex>
          </div>
        </PaletteCard>
      ))}
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
            message: `Undo-style toast ${index} content`,
          })}
          onUndo={() => {}}
          onDismiss={() => setUndoCount(c => c - 1)}
          key={`undo-toast-${index}`}
        />
      ))}
    </>
  );
});
