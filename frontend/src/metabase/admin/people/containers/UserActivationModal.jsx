/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import User from "metabase/entities/users";

import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";
import Text from "metabase/components/type/Text";

// NOTE: we have to load the list of users because /api/user/:id doesn't return deactivated users
// but that's ok because it's probably already loaded through the people PeopleListingApp
class UserActivationModalInner extends React.Component {
  render() {
    const { user, onClose } = this.props;
    if (!user) {
      return null;
    }

    if (user.is_active) {
      return (
        <ModalContent
          // XXX: use common_name to standardize user display name.
          // https://user-images.githubusercontent.com/1937582/172611760-f1a77c83-2f4c-4d13-baea-ade1c39637ea.png
          title={t`Deactivate ${user.getName()}?`}
          onClose={onClose}
        >
          {/* XXX: use common_name to standardize user display name. */}
          {/* // https://user-images.githubusercontent.com/1937582/172611760-f1a77c83-2f4c-4d13-baea-ade1c39637ea.png */}
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
          // XXX: use common_name to standardize user display name.
          // https://user-images.githubusercontent.com/1937582/172611889-b2f7f474-dea1-4cab-85b7-d36da3e94dcb.png
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

const UserActivationModal = _.compose(
  User.loadList({
    query: { include_deactivated: true },
    wrapped: true,
  }),
  connect((state, { users, params: { userId } }) => ({
    user: _.findWhere(users, { id: parseInt(userId) }),
  })),
)(UserActivationModalInner);

export default UserActivationModal;
