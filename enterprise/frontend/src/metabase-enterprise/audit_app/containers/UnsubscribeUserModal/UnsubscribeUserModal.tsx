import { t } from "ttag";
import _ from "underscore";

import Users from "metabase/entities/users";
import { connect } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { AuditApi } from "metabase-enterprise/services";
import type { User } from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

import { UnsubscribeUserForm } from "../../components/UnsubscribeUserForm";

const mapDispatchToProps = (dispatch: Dispatch) => ({
  onUnsubscribe: async ({ id }: User) => {
    await AuditApi.unsubscribe_user({ id });
    dispatch(addUndo({ message: t`Unsubscribe successful` }));
  },
});

export const UnsubscribeUserModal = _.compose(
  Users.load({
    id: (_state: State, props: { params: { userId: string } }) =>
      Number.parseInt(props.params.userId),
  }),
  connect(null, mapDispatchToProps),
)(UnsubscribeUserForm);
