import React from "react";
import { connect } from "react-redux";
import { Box } from "grid-styled";
import { t } from "c-3po";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";

import { reactivateUser, deactivateUser } from "metabase/admin/people/people";

import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";
import Text from "metabase/components/Text";

@entityObjectLoader({
  entityType: "users",
  entityId: (state, props) => props.params.userId,
  entityQuery: () => ({ include_deactivated: true }),
})
@connect(null, { reactivateUser, deactivateUser })
class UserActivationModal extends React.Component {
  render() {
    const { object, onClose, deactivateUser, reactivateUser } = this.props;

    const user = object;
    const action = user.is_active ? deactivateUser : reactivateUser;
    const actionText = user.is_active ? t`Deactivate` : t`Reactivate`;

    const title = user && `${actionText} ${user.first_name}?`;
    return (
      <ModalContent title={title} onClose={onClose}>
        <Text>{t`They won't be able to log in anymore`}</Text>
        <Button ml="auto" danger onClick={() => action(user) && onClose()}>
          {actionText}
        </Button>
      </ModalContent>
    );
  }
}

export default UserActivationModal;
