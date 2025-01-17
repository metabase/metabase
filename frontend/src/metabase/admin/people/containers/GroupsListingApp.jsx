import _ from "underscore";

import Group from "metabase/entities/groups";
import { connect } from "metabase/lib/redux";
import { PLUGIN_GROUP_MANAGERS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";

import GroupsListing from "../components/GroupsListing";

const mapStateToProps = (state, props) => ({
  groups: Group.selectors.getList(state, props),
  isAdmin: getUserIsAdmin(state),
});

const mapDispatchToProps = {
  delete: PLUGIN_GROUP_MANAGERS.deleteGroup ?? Group.actions.delete,
};

export default _.compose(
  Group.loadList({ reload: true }),
  connect(mapStateToProps, mapDispatchToProps),
)(GroupsListing);
