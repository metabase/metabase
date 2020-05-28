import React from "react";

import { t } from "ttag";

import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";
import FormMessage from "metabase/components/form/FormMessage";

class ArchiveModal extends React.Component {
  state = {
    error: null,
  };

  archive = async () => {
    const { onArchive, onClose } = this.props;
    try {
      await onArchive();
      if (onClose) {
        onClose();
      }
    } catch (error) {
      this.setState({ error });
    }
  };

  render() {
    const { title, message, onClose } = this.props;
    const { error } = this.state;
    return (
      <ModalContent
        title={title || t`Archive this?`}
        footer={[
          error ? <FormMessage formError={error} /> : null,
          <Button key="cancel" onClick={onClose}>
            {t`Cancel`}
          </Button>,
          <Button key="archive" warning onClick={this.archive}>
            {t`Archive`}
          </Button>,
        ]}
      >
        {message}
      </ModalContent>
    );
  }
}

export default ArchiveModal;
