/* eslint-disable react/prop-types */
import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";
import { t } from "ttag";

import User from "metabase/entities/users";
import * as Urls from "metabase/lib/urls";

const NewUserModal = ({ onClose, onSaved, ...props }) => (
  <User.ModalForm
    {...props}
    title={t`New user`}
    onClose={onClose}
    onSaved={onSaved}
  />
);

export default connect(null, {
  onClose: goBack,
  onSaved: user => push(Urls.newUserSuccess(user.id)),
})(NewUserModal);
