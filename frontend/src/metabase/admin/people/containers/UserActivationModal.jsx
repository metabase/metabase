import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import User from "metabase/entities/users";

import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";
import Text from "metabase/components/Text";

// NOTE: we have to load the list of users because /api/user/:id doesn't return deactivated users
// but that's ok because it's probably already loaded through the people PeopleListingApp
@User.loadList({
  query: { include_deactivated: true },
  wrapped: true,
})
@connect((state, { users, params: { userId } }) => ({
  user: _.findWhere(users, { id: parseInt(userId) }),
}))
class UserActivationModal extends React.Component {
  render() {
    const { user, onClose } = this.props;
    if (!user) {
      return null;
    }

    if (user.is_active) {
      return (
        <ModalContent
          title={t`Deactivate ${user.getName()}?`}
          onClose={onClose}
        >
          <Text>{t`${user.getName()} won't be able to log in anymore.`}</Text>
          <Button
            ml="auto"
            danger
            onClick={() => user.deactivate() && onClose()}
          >
            {t`Deactivate`}
          </Button>
        </ModalContent>
      );
    } else {
      return (
        <ModalContent
          title={t`Reactivate ${user.getName()}?`}
          onClose={onClose}
        >
          <Text>
            {t`They'll be able to log in again, and they'll be placed back into the groups they were in before their account was deactivated.`}
          </Text>
          <Button
            ml="auto"
            danger
            onClick={() => user.reactivate() && onClose()}
          >
            {t`Reactivate`}
          </Button>
        </ModalContent>
      );
    }
  }
}

export default UserActivationModal;
