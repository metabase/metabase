import React, { useState } from "react";
import { t } from "ttag";

import Modal from "metabase/components/Modal";
import Radio from "metabase/core/components/Radio";
import Button from "metabase/core/components/Button";

type DeleteGroupMappingModalProps = {
  onHide: () => void;
};

const DeleteGroupMappingModal = ({ onHide }: DeleteGroupMappingModalProps) => {
  const [value, setValue] = useState("nothing");

  const handleChange = (newValue: string) => {
    setValue(newValue);
  };

  return (
    <Modal>
      <div className="px4">
        <div className="pt4">
          <h2>{t`Remove this group mapping?`}</h2>
        </div>
        <div className="pt4">
          <p className="text-measure">
            {t`This group's user membership will no longer be synced with the directory server.`}
          </p>
        </div>
        <div className="pt4">
          <p className="text-measure">
            {t`What should happen with the group itself in ⚠️fill in dynamic application name?`}
          </p>
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
                value: "remove-all-members",
              },
              {
                name: t`Also delete the group`,
                value: "delete-group",
              },
            ]}
            showButtons
            onChange={handleChange}
          />
        </div>
        <div className="pt4">
          <Button onClick={onHide}>{t`Cancel`}</Button>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteGroupMappingModal;
