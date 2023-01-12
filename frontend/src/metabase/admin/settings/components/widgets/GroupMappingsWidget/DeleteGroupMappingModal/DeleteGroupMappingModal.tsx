import React, { useState } from "react";
import { t } from "ttag";

import Modal from "metabase/components/Modal";
import { ModalFooter } from "metabase/components/ModalContent";
import Radio from "metabase/core/components/Radio";
import Button from "metabase/core/components/Button";

import {
  ModalHeader,
  ModalSubtitle,
  ModalRadioRoot,
} from "./DeleteGroupMappingModal.styled";

type DeleteGroupMappingModalProps = {
  onHide: () => void;
};

const DeleteGroupMappingModal = ({ onHide }: DeleteGroupMappingModalProps) => {
  const [value, setValue] = useState("nothing");

  const handleChange = (newValue: string) => {
    setValue(newValue);
  };

  const submitButtonLabels: Record<string, string> = {
    nothing: t`Remove mapping`,
    removeAllMembers: t`Remove mapping and members`,
    deleteGroup: t`Remove mapping and delete group`,
  };

  return (
    <Modal>
      <div>
        <ModalHeader>{t`Remove this group mapping?`}</ModalHeader>
        <ModalSubtitle>
          {t`This group's user membership will no longer be synced with the directory server.`}
        </ModalSubtitle>
        <ModalRadioRoot>
          <p>{t`What should happen with the group itself in Metabase?`}</p>

          <Radio
            className="ml2"
            vertical
            value={value}
            options={[
              {
                name: t`Nothing, just remove the mapping.`,
                value: "nothing",
              },
              {
                name: t`Also remove all group members`,
                value: "removeAllMembers",
              },
              {
                name: t`Also delete the group`,
                value: "deleteGroup",
              },
            ]}
            showButtons
            onChange={handleChange}
          />
        </ModalRadioRoot>
        <ModalFooter>
          <Button onClick={onHide}>{t`Cancel`}</Button>
          <Button danger onClick={onHide}>
            {submitButtonLabels[value]}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
};

export default DeleteGroupMappingModal;
