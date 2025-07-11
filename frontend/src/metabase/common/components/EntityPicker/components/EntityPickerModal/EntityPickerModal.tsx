import { useModalOpen } from "metabase/common/hooks/use-modal-open";
import { Modal } from "metabase/ui";
import type { SearchResultId } from "metabase-types/api";

import type { TypeWithModel } from "../../types";

import {
  EntityPickerContent,
  type EntityPickerModalContentProps,
} from "./EntityPickerContent";

export type EntityPickerModalProps<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> = EntityPickerModalContentProps<Id, Model, Item> & {
  trapFocus?: boolean;
};

export function EntityPickerModal<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  trapFocus = true,
  onClose,
  children,
  ...contentProps
}: EntityPickerModalProps<Id, Model, Item>) {
  const { open } = useModalOpen();

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

      <EntityPickerContent {...contentProps} onClose={onClose}>
        {children}
      </EntityPickerContent>
    </Modal.Root>
  );
}
