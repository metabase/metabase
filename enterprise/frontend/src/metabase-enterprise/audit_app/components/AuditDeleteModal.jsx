import React, { useCallback, useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Button from "metabase/components/Button";
import CheckBox from "metabase/components/CheckBox";
import FormMessage from "metabase/components/form/FormMessage";
import ModalContent from "metabase/components/ModalContent";
import { CheckboxLabel } from "./AuditDeleteModal.styled";

const propTypes = {
  item: PropTypes.object.isRequired,
  title: PropTypes.string,
  description: PropTypes.string,
  onSubmit: PropTypes.func,
  onClose: PropTypes.func,
};

const AuditDeleteModal = ({ item, title, description, onSubmit, onClose }) => {
  const [error, setError] = useState();
  const [checked, setChecked] = useState(false);

  const handleArchiveClick = useCallback(async () => {
    try {
      await onSubmit(item);
      onClose();
    } catch (error) {
      setError(error);
    }
  }, [item, onSubmit, onClose]);

  const handleCheckedChange = useCallback(event => {
    setChecked(event.target.checked);
  }, []);

  return (
    <ModalContent
      title={title}
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
        label={<CheckboxLabel>{description}</CheckboxLabel>}
        size={20}
        checkedColor="danger"
        uncheckedColor="danger"
        onChange={handleCheckedChange}
      />
    </ModalContent>
  );
};

AuditDeleteModal.propTypes = propTypes;

export default AuditDeleteModal;
