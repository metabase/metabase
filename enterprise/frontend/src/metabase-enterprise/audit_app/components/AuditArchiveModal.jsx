import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { formatChannel } from "metabase/lib/notifications";
import Button from "metabase/components/Button";
import CheckBox from "metabase/components/CheckBox";
import FormMessage from "metabase/components/form/FormMessage";
import ModalContent from "metabase/components/ModalContent";
import { CheckboxLabel } from "metabase/components/DeleteModalWithConfirm.styled";

const propTypes = {
  item: PropTypes.object.isRequired,
  type: PropTypes.oneOf(["alert", "pulse"]).isRequired,
  onArchive: PropTypes.func,
  onClose: PropTypes.func,
};

const AuditArchiveModal = ({ item, type, onArchive, onClose }) => {
  const [error, setError] = useState();
  const [checked, setChecked] = useState(false);

  const handleArchiveClick = useCallback(async () => {
    try {
      await onArchive(item, true);
      onClose();
    } catch (error) {
      setError(error);
    }
  }, [item, onArchive, onClose]);

  const handleCheckedChange = useCallback(event => {
    setChecked(event.target.checked);
  }, []);

  return (
    <ModalContent
      title={getTitleMessage(item, type)}
      footer={[
        error ? <FormMessage key="message" formError={error} /> : null,
        <Button key="cancel" onClick={onClose}>
          {t`Cancel`}
        </Button>,
        <Button
          key="submit"
          warning
          disabled={!checked}
          onClick={handleArchiveClick}
        >
          {t`Delete`}
        </Button>,
      ]}
      onClose={onClose}
    >
      <CheckBox
        checked={checked}
        label={<CheckboxLabel>{getChannelMessage(item, type)}</CheckboxLabel>}
        size={20}
        checkedColor="danger"
        uncheckedColor="danger"
        onChange={handleCheckedChange}
      />
    </ModalContent>
  );
};

AuditArchiveModal.propTypes = propTypes;

const getTitleMessage = (item, type) => {
  switch (type) {
    case "alert":
      return t`Delete this alert?`;
    case "pulse":
      return t`Delete this subscription to ${item.name}?`;
  }
};

const getChannelMessage = (item, type) => {
  const channelMessage = formatChannel(item);

  switch (type) {
    case "alert":
      return t`This alert will no longer be ${channelMessage}.`;
    case "pulse":
      return t`This dashboard will no longer be ${channelMessage}.`;
  }
};
