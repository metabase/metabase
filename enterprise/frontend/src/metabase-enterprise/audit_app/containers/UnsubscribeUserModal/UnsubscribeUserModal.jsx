import { t } from "ttag";
import _ from "underscore";

import Users from "metabase/entities/users";
import { connect } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { AuditApi } from "metabase-enterprise/services";

import UnsubscribeUserForm from "../../components/UnsubscribeUserForm";

const mapDispatchToProps = dispatch => ({
  onUnsubscribe: async ({ id }) => {
    await AuditApi.unsubscribe_user({ id });
    dispatch(addUndo({ message: t`Unsubscribe successful` }));
  },
});

export default _.compose(
  Users.load({
    id: (state, props) => Number.parseInt(props.params.userId),
  }),
  connect(null, mapDispatchToProps),
)(UnsubscribeUserForm);
