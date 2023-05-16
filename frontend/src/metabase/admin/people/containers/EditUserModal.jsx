/* eslint-disable react/prop-types */
import React from "react";
import { compose } from "@reduxjs/toolkit";
import { t } from "ttag";

import User from "metabase/entities/users";

const EditUserModal = ({ user, onClose, ...props }) => (
  <User.ModalForm
    {...props}
    title={t`Edit user`}
    user={user}
    onSaved={onClose}
    onClose={onClose}
  />
);

export default compose(
  User.load({ id: (state, props) => props.params.userId }),
)(EditUserModal);
