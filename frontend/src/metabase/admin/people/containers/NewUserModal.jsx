import React from "react";
import * as Urls from "metabase/lib/urls";
import { connect } from "react-redux";
import { goBack, push } from "react-router-redux";

import UserForm from "metabase/admin/people/containers/UserForm";

const NewUserModal = ({ onClose, goBack, push }) => (
  <UserForm
    onClose={goBack}
    onSaved={({ id, password }) => push(Urls.newUserSuccess(id, password))}
  />
);

export default connect(null, { goBack, push })(NewUserModal);
