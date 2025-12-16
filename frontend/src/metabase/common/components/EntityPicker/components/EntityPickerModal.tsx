import { useWindowEvent } from "@mantine/hooks";
import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useModalOpen } from "metabase/common/hooks/use-modal-open";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import resizeObserver from "metabase/lib/resize-observer";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Modal,
  Repeat,
  Skeleton,
  TextInput,
} from "metabase/ui";
import type { RecentContexts, SearchResultId } from "metabase-types/api";

import type {
  EntityPickerOptions,
  OmniPickerItem,
  OmniPickerValue,
  TypeWithModel,
} from "../types";

import S from "./EntitityPickerModal.module.css";
import { EntityPicker } from "./EntityPicker";

export type EntityPickerModalOptions = {
  showSearch?: boolean;
  hasConfirmButtons?: boolean;
  confirmButtonText?: string | ((model?: string) => string);
  cancelButtonText?: string;
  hasRecents?: boolean;
  showDatabases?: boolean;
  showLibrary?: boolean;
  showRootCollection?: boolean;
};

export const defaultOptions: EntityPickerModalOptions = {
  showSearch: true,
  showRecents: true,
  showConfirmButtons: true,
  showLibrary: true,
  showDatabases: true,
};

export const DEFAULT_RECENTS_CONTEXT: RecentContexts[] = [
  "selections",
  "views",
];

export interface EntityPickerModalProps<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> {
  title?: string;
  models: OmniPickerItem["model"][];
  value?: OmniPickerValue;
  options?: Partial<EntityPickerOptions>;
  /**recentsContext: Defaults to returning recents based off both views and selections. Can be overridden by props */
  recentsContext?: RecentContexts[];
  onClose: () => void;
  onChange?: (item: Item) => void;
}

export function EntityPickerModal({
  title = t`Choose an item`,
  models,
  value: initialValue,
  options,
  trapFocus = true,
  recentsContext = DEFAULT_RECENTS_CONTEXT,
  onClose,
  onChange,
}: EntityPickerModalProps<Id, Model, Item>) {
  const [modalContentMinWidth, setModalContentMinWidth] = useState(920);
  const modalContentRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const hydratedOptions = useMemo(
    () => ({ ...defaultOptions, ...options }),
    [options],
  );

  const { open } = useModalOpen();

  useWindowEvent(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        !disableCloseOnEscape && onClose();
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
      trapFocus={trapFocus}
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
        <Modal.Header
          px="2.5rem"
          pt="1rem"
          pb="1rem"
          bg="var(--mb-color-background)"
        >
          <Modal.Title id={titleId} fz="lg">
            {title}
          </Modal.Title>
          <Modal.CloseButton size={21} pos="relative" top="1px" />
        </Modal.Header>
        <Modal.Body className={S.modalBody} p="0">
          {hydratedOptions.showSearch && (
            <Box px="2.5rem" mb="1.5rem">
              <TextInput
                classNames={{ input: S.textInput }}
                data-autofocus
                type="search"
                leftSection={<Icon name="search" size={16} />}
                miw={400}
                placeholder={t`Search...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value ?? "")}
                rightSection={
                  searchQuery.length ? (
                    <ActionIcon onClick={() => setSearchQuery("")}>
                      <Icon name="close" size={16} />
                    </ActionIcon>
                  ) : null
                }
              />
            </Box>
          )}
          <ErrorBoundary>
            <EntityPicker
              searchQuery={searchQuery}
              models={models}
              initialValue={initialValue}
              onChange={onChange}
              onCancel={onClose}
              options={hydratedOptions}
            />
          </ErrorBoundary>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

const EntityPickerLoadingSkeleton = () => (
  <Box data-testid="loading-indicator" className={S.loadingSkeleton}>
    <Flex px="2rem" gap="1.5rem" mb="3.5rem">
      <Repeat times={3}>
        <Skeleton h="2rem" w="5rem" mb="0.5rem" />
      </Repeat>
    </Flex>
    <Flex px="2rem" mb="2.5rem" direction="column">
      <Repeat times={2}>
        <Skeleton h="3rem" mb="0.5rem" />
      </Repeat>
    </Flex>
    <Flex px="2rem" direction="column">
      <Repeat times={3}>
        <Skeleton h="3rem" mb="0.5rem" />
      </Repeat>
    </Flex>
  </Box>
);
