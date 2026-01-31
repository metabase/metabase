import {
  useDebouncedCallback,
  useDisclosure,
  useWindowEvent,
} from "@mantine/hooks";
import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useModalOpen } from "metabase/common/hooks/use-modal-open";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import resizeObserver from "metabase/lib/resize-observer";
import { ActionIcon, Box, Icon, Modal, TextInput } from "metabase/ui";
import type { RecentContexts } from "metabase-types/api";

import { useLogRecentItem } from "../hooks";
import type {
  EntityPickerOptions,
  EntityPickerProps,
  OmniPickerItem,
  OmniPickerValue,
} from "../types";

import S from "./EntitityPickerModal.module.css";
import { EntityPicker } from "./EntityPicker";

export const DEFAULT_RECENTS_CONTEXT: RecentContexts[] = [
  "selections",
  "views",
];

const defaultOptions: EntityPickerOptions = {
  hasSearch: true,
  hasRecents: true,
  hasDatabases: false,
  hasLibrary: true,
  hasRootCollection: true,
  hasPersonalCollections: true,

  hasConfirmButtons: true,
  canCreateCollections: false,
  canCreateDashboards: false,
};

export type EntityPickerModalProps = {
  title?: string;
  value?: OmniPickerValue;
  onClose: () => void;
  recentsContext?: RecentContexts[];
  options?: EntityPickerOptions;
} & Omit<
  EntityPickerProps,
  | "options"
  | "isNewCollectionDialogOpen"
  | "openNewCollectionDialog"
  | "closeNewCollectionDialog"
  | "isNewDashboardDialogOpen"
  | "openNewDashboardDialog"
  | "closeNewDashboardDialog"
>;

export function EntityPickerModal({
  title = t`Choose an item`,
  options,
  onClose,
  onChange,
  ...rest
}: EntityPickerModalProps) {
  const [modalContentMinWidth, setModalContentMinWidth] = useState(920);
  const modalContentRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [
    isNewCollectionDialogOpen,
    { open: openNewCollectionDialog, close: closeNewCollectionDialog },
  ] = useDisclosure(false);
  const [
    isNewDashboardDialogOpen,
    { open: openNewDashboardDialog, close: closeNewDashboardDialog },
  ] = useDisclosure(false);

  const hydratedOptions: EntityPickerOptions = useMemo(
    () => ({ ...defaultOptions, ...options }),
    [options],
  );

  const { open } = useModalOpen();

  const { tryLogRecentItem } = useLogRecentItem();

  const isDialogOpen = isNewCollectionDialogOpen || isNewDashboardDialogOpen;

  const handleChange = useCallback(
    async (item: OmniPickerItem) => {
      if (isDialogOpen) {
        return;
      }
      await onChange(item);
      tryLogRecentItem(item);
    },
    [isDialogOpen, onChange, tryLogRecentItem],
  );

  useWindowEvent(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        !isDialogOpen && onClose();
      }
    },
    { capture: true },
  );

  const titleId = useUniqueId("entity-picker-modal-title-");

  const modalContentResizeHandler = useCallback(
    (entry: ResizeObserverEntry) => {
      const width = entry.contentRect.width;
      setModalContentMinWidth((currentWidth) =>
        currentWidth < width ? width : currentWidth,
      );
    },
    [],
  );

  const modalContentCallbackRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        resizeObserver.subscribe(element, modalContentResizeHandler);
        modalContentRef.current = element;
      } else {
        if (modalContentRef.current) {
          resizeObserver.unsubscribe(
            modalContentRef.current,
            modalContentResizeHandler,
          );
        }
      }
    },
    [modalContentResizeHandler],
  );

  return (
    <Modal.Root
      opened={open}
      onClose={onClose}
      data-testid="entity-picker-modal"
      /**
       * Both children of this component have "position: fixed" so the element's height is 0 by default.
       * This makes the following assertion to fail in Cypress:
       *   cy.findByTestId("entity-picker-modal").should("be.visible");
       * Height is specified here to make that assertion pass.
       */
      h="100vh"
      w="100vw"
      closeOnEscape={false} // we're doing this manually in useWindowEvent
      yOffset="10dvh"
    >
      <Modal.Overlay />
      <Modal.Content
        className={S.modalContent}
        aria-labelledby={titleId}
        miw={`min(${modalContentMinWidth}px, 80vw)`}
        w="fit-content"
        maw="80vw"
        ref={modalContentCallbackRef}
      >
        <Modal.Header px="1.5rem" pt="1rem" pb="1rem" bg="background-primary">
          <Modal.Title id={titleId} fz="lg">
            {title}
          </Modal.Title>
          <Modal.CloseButton size={21} pos="relative" top="1px" />
        </Modal.Header>
        <Modal.Body className={S.modalBody} p="0">
          {hydratedOptions.hasSearch && (
            <Box px="1.5rem" mb="1.5rem">
              <SearchInput value={searchQuery} onChange={setSearchQuery} />
            </Box>
          )}
          <EntityPicker
            searchQuery={searchQuery}
            onChange={handleChange}
            options={hydratedOptions}
            onClose={onClose}
            isNewCollectionDialogOpen={isNewCollectionDialogOpen}
            openNewCollectionDialog={openNewCollectionDialog}
            closeNewCollectionDialog={closeNewCollectionDialog}
            isNewDashboardDialogOpen={isNewDashboardDialogOpen}
            openNewDashboardDialog={openNewDashboardDialog}
            closeNewDashboardDialog={closeNewDashboardDialog}
            {...rest}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

const SearchInput = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const [localValue, setLocalValue] = useState(value);
  const debouncedOnChange = useDebouncedCallback((newValue: string) => {
    onChange(newValue);
  }, 300);
  return (
    <TextInput
      classNames={{ input: S.textInput }}
      data-autofocus
      type="search"
      leftSection={<Icon name="search" size={16} />}
      miw={400}
      placeholder={t`Search…`}
      value={localValue}
      onChange={(e) => {
        const newValue = e.target.value ?? "";
        setLocalValue(newValue);
        debouncedOnChange(newValue);
      }}
      rightSection={
        value.length ? (
          <ActionIcon
            onClick={() => {
              setLocalValue("");
              onChange("");
            }}
            data-testid="clear-search"
          >
            <Icon name="close" size={16} />
          </ActionIcon>
        ) : null
      }
    />
  );
};
