import _ from "underscore";

import Group from "metabase/entities/groups";
import Users from "metabase/entities/users";
import type { GroupId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { GroupDetail } from "../components/GroupDetail";

export const GroupDetailApp = _.compose(
  Users.loadList(),
  Group.load({
    id: (_state: State, props: { params: { groupId: GroupId } }) =>
      props.params.groupId,
    reload: true,
  }),
)(GroupDetail);
