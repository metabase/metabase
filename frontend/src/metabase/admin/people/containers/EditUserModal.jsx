import React from "react";

import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import UserForm from "metabase/admin/people/containers/UserForm";

@entityObjectLoader(props => ({
  entityType: "user",
  entityId: props.prams.userId,
}))
class EditUserModal extends React.Component {
  render() {
    return <UserForm user={this.props.object} />;
  }
}

export default EditUserModal;
