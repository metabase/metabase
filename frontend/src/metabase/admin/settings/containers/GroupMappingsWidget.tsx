import { connect } from "react-redux";
import _ from "underscore";

import Group from "metabase/entities/groups";
import GroupMappingsWidget from "metabase/admin/settings/components/widgets/GroupMappingsWidget/GroupMappingsWidget";
import { updateSetting } from "metabase/admin/settings/settings";
import { getSetting } from "metabase/selectors/settings";

import type { State } from "metabase-types/store";
import type { Settings } from "metabase-types/api/settings";

const mapStateToProps = (
  state: State,
  props: { mappingSetting: keyof Settings },
) => {
  return {
    allGroups: Group.selectors.getList(state),
    mappings: getSetting(state, props.mappingSetting) || {},
  };
};

const mapDispatchToProps = {
  updateSetting,
  deleteGroup: Group.actions.delete,
  clearGroupMember: Group.actions.clearMember,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  Group.loadList(),
)(GroupMappingsWidget);
