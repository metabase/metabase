import { type Dispatch, type SetStateAction, memo, useState } from "react";

import { EntityPickerModal } from "metabase/common/components/EntityPicker";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import LegacyModal from "metabase/components/Modal";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import { FloatingUndoList, UndoToast } from "metabase/containers/UndoListing";
import TippyTooltip from "metabase/core/components/Tooltip";
import { PaletteCard } from "metabase/palette/components/Palette";
import {
  Box,
  Button,
  type ButtonProps,
  Flex,
  Group,
  Icon,
  Menu as MantineMenu,
  Modal as MantineModal,
  Popover as MantinePopover,
  Tooltip as MantineTooltip,
  type ModalProps,
  Paper,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import { createMockUndo } from "metabase-types/api/mocks";

import { BulkActionBarInner } from "../../../components/BulkActionBar/BulkActionBar";

const _Launchers = ({
  nested,
  setUndoCount,
  setToastCount,
  setLegacyModalCount,
  setMantineModalCount,
  setSidesheetCount,
  setEntityPickerCount,
  setCommandPaletteCount,
}: {
  nested?: boolean;
  setUndoCount: Dispatch<SetStateAction<number>>;
  setToastCount: Dispatch<SetStateAction<number>>;
  setLegacyModalCount: Dispatch<SetStateAction<number>>;
  setMantineModalCount: Dispatch<SetStateAction<number>>;
  setSidesheetCount: Dispatch<SetStateAction<number>>;
  setEntityPickerCount: Dispatch<SetStateAction<number>>;
  setCommandPaletteCount: Dispatch<SetStateAction<number>>;
}) => {
  const titleSuffix = nested ? " (nested)" : "";
  return (
    <Group>
      <MantineTooltip withinPortal label={"Tooltip content" + titleSuffix}>
        <Button w="20rem">Mantine tooltip target {titleSuffix}</Button>
      </MantineTooltip>
      <MantinePopover withinPortal>
        <MantinePopover.Target>
          <Button w="20rem">Mantine popover target {titleSuffix}</Button>
        </MantinePopover.Target>
        <MantinePopover.Dropdown>
          <Paper p="md">Popover content {titleSuffix}</Paper>
        </MantinePopover.Dropdown>
      </MantinePopover>
      <MantineMenu>
        <MantineMenu.Target>
          Mantine Menu target {titleSuffix}
        </MantineMenu.Target>
        <MantineMenu.Dropdown>
          Mantine Menu dropdown content {titleSuffix}
        </MantineMenu.Dropdown>
      </MantineMenu>
      <TippyTooltip tooltip={"Tooltip content" + titleSuffix}>
        <Button w="20rem">Legacy tooltip target {titleSuffix}</Button>
      </TippyTooltip>
      <TippyPopover
        content={<Paper p="md">Popover content {titleSuffix}</Paper>}
      >
        <Button w="20rem">Legacy popover target {titleSuffix} </Button>
      </TippyPopover>
      <Button onClick={() => setLegacyModalCount(c => c + 1)}>
        Legacy modal
      </Button>
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
      <Button onClick={() => setUndoCount(c => c + 1)}>Undo-style toast</Button>
      <Button onClick={() => setToastCount(c => c + 1)}>Toast</Button>
      <Button onClick={() => setMantineModalCount(c => c + 1)}>
        Mantine modal
      </Button>
      <Button onClick={() => setSidesheetCount(c => c + 1)}>Sidesheet</Button>
      <Button onClick={() => setEntityPickerCount(c => c + 1)}>
        Entity Picker
      </Button>
      {!nested && (
        <Button onClick={() => setCommandPaletteCount(c => c + 1)}>
          Command Palette Modal
        </Button>
      )}
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
  const [sidesheetCount, setSidesheetCount] = useState(0);
  const [entityPickerCount, setEntityPickerCount] = useState(0);
  const [commandPaletteCount, setCommandPaletteCount] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const Launchers = ({ nested }: { nested?: boolean }) => (
    <_Launchers
      setToastCount={setToastCount}
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
      {Array.from({ length: toastCount }).map((_, index) => (
        <BulkActionBarInner
          key={`simple-bulk-action-bar-${index}`}
          opened
          message="Toast message"
          isNavbarOpen={false}
        >
          <CloseButton
            onClick={() => setToastCount(c => c - 1)}
            c="#fff"
            bg="transparent"
          />
          {enableNesting && <Launchers nested />}
        </BulkActionBarInner>
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
