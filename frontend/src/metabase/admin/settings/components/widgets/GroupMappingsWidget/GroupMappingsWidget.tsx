import _ from "underscore";

import { updateSetting } from "metabase/admin/settings/settings";
import Group from "metabase/entities/groups";
import { connect } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import type { Settings } from "metabase-types/api/settings";
import type { State } from "metabase-types/store";

import { GroupMappingsWidgetView } from "./GroupMappingsWidgetView";

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

export const GroupMappingsWidget = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  Group.loadList(),
)(GroupMappingsWidgetView);
