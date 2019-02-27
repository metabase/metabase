import React from "react";
import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import { t } from "c-3po";

import * as Urls from "metabase/lib/urls";

import User from "metabase/entities/users";

import ModalContent from "metabase/components/ModalContent";

const NewUserModal = ({ onClose, onSaved, ...props }) => (
  <ModalContent title={t`New user`} onClose={onClose}>
    <User.Form {...props} onSaved={onSaved} />
  </ModalContent>
);

export default connect(null, {
  onClose: goBack,
  onSaved: user => push(Urls.newUserSuccess(user.id)),
})(NewUserModal);
