import { useState } from "react";

import { Flex, Modal } from "metabase/ui";

import { OmniPicker, type OmniPickerProps } from "./OmniPicker";
import { OmniPickerSearch } from "./OmniPickerSearch";

export type OmniPickerModalProps = {
  opened: boolean;
  onClose: () => void;
} & OmniPickerProps;

export function OmniPickerModal({ opened, onClose, ...omniPickerProps }: OmniPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <Modal.Root opened={opened} onClose={onClose}>
      <Modal.Overlay/>
      <Modal.Content>
        <Modal.Header>
          <Flex align="center" gap="sm" w="100%">
            <OmniPickerSearch searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
            <Modal.CloseButton onClick={onClose} />
          </Flex>
        </Modal.Header>
        <Modal.Body>
          <OmniPicker
            searchQuery={searchQuery}
            {...omniPickerProps}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
