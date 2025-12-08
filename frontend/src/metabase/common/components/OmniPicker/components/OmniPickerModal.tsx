import { useState } from "react";

import { Flex, Modal } from "metabase/ui";

import { OmniPicker, type OmniPickerProps } from "./OmniPicker";
import S from "./OmniPicker.module.css";
import { OmniPickerSearch } from "./OmniPickerSearch";

export type OmniPickerModalProps = {
  opened: boolean;
  onClose: () => void;
} & OmniPickerProps;

export function OmniPickerModal({ opened, onClose, ...omniPickerProps }: OmniPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <Modal.Root opened={opened} onClose={onClose} h="100%" w="100%" yOffset="10dvh">
      <Modal.Overlay/>
      <Modal.Content
        w="fit-content"
        maw="80vw"
        className={S.modalContent}
      >
        <Modal.Header>
          <Flex align="center" gap="sm" w="100%">
            <OmniPickerSearch searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
            <Modal.CloseButton onClick={onClose} />
          </Flex>
        </Modal.Header>
        <Modal.Body p={0}>
          <OmniPicker
            searchQuery={searchQuery}
            {...omniPickerProps}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
