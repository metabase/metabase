import React from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";

import Users from "metabase/entities/users";

import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import UserForm from "metabase/admin/people/containers/UserForm";

@entityObjectLoader({
  entityType: "users",
  entityId: (state, props) => props.params.userId,
})
@connect(null, { goBack })
class EditUserModal extends React.Component {
  render() {
    const { object, goBack } = this.props;
    return <UserForm user={object} onClose={goBack} onSaved={goBack} />;
  }
}

export default EditUserModal;
