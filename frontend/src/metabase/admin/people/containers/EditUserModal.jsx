import React from "react";

import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import UserForm from "metabase/admin/people/containers/UserForm";

@entityObjectLoader({
  entityType: "users",
  entityId: (state, props) =>  props.params.userId,
})
class EditUserModal extends React.Component {
  render() {
    const { object, onClose } = this.props
    return <UserForm user={object} onClose={onClose} />;
  }
}

export default EditUserModal;
