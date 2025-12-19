import _ from "underscore";

import { updateSetting } from "metabase/admin/settings/settings";
import { Groups } from "metabase/entities/groups";
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
    allGroups: Groups.selectors.getList(state),
    mappings: getSetting(state, props.mappingSetting) || {},
  };
};

const mapDispatchToProps = {
  updateSetting,
  deleteGroup: Groups.actions.delete,
  clearGroupMember: Groups.actions.clearMember,
};

export const GroupMappingsWidget = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  Groups.loadList(),
)(GroupMappingsWidgetView);
