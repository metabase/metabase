/* eslint-disable react/prop-types */
import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import { t } from "ttag";

import { Modal } from "metabase/ui";

import * as Urls from "metabase/lib/urls";

import User from "metabase/entities/users";
import { useModalOpen } from "metabase/hooks/use-modal-open";

const NewUserModal = ({ onClose, onSaved, ...props }) => {
  const { open } = useModalOpen();

  return (
    <Modal opened={open} onClose={onClose} title={t`New User`}>
      <User.Form {...props} onSaved={onSaved} />
    </Modal>
  );
};

export default connect(null, {
  onClose: goBack,
  onSaved: user => push(Urls.newUserSuccess(user.id)),
})(NewUserModal);
