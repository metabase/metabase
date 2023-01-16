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

type GroupIds = number[];
type DNType = string;
type ValueType = "nothing" | "clearAllPermissions" | "delete";

type DeleteGroupMappingModalProps = {
  dn: DNType;
  groupIds: GroupIds;
  onConfirm: (value: ValueType, groups: number[], dn: DNType) => void;
  onHide: () => void;
};

const DeleteGroupMappingModal = ({
  dn,
  groupIds,
  onConfirm,
  onHide,
}: DeleteGroupMappingModalProps) => {
  const [value, setValue] = useState("nothing");

  const handleChange = (newValue: ValueType) => {
    setValue(newValue);
  };

  const handleConfirm = () => {
    onConfirm(value as ValueType, groupIds, dn);
  };

  const submitButtonLabels: Record<ValueType, string> = {
    nothing: t`Remove mapping`,
    clearAllPermissions: t`Remove mapping and members`,
    delete: t`Remove mapping and delete group`,
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
            value={value as ValueType | undefined}
            options={[
              {
                name: t`Nothing, just remove the mapping.`,
                value: "nothing",
              },
              {
                name: t`Also remove all group members`,
                value: "clearAllPermissions",
              },
              {
                name: t`Also delete the group`,
                value: "delete",
              },
            ]}
            showButtons
            onChange={handleChange}
          />
        </ModalRadioRoot>
        <ModalFooter>
          <Button onClick={onHide}>{t`Cancel`}</Button>
          <Button danger onClick={handleConfirm}>
            {submitButtonLabels[value as ValueType]}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
};

export default DeleteGroupMappingModal;
