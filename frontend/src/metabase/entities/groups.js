/* @flow */

import { createEntity } from "metabase/lib/entities";

import _ from "underscore";

import type { GroupId } from "metabase/meta/types/Permissions";

const Groups = createEntity({
  name: "groups",
  path: "/api/permissions/group",
  api: {
    // TODO: replace fake `get` with real endpoint
    // $FlowFixMe: expects a `Data` object, unsure why this doesn't satisfy it
    get: async ({ id }: { id: GroupId }) => {
      const group = _.findWhere(await Groups.api.list(), { id: parseInt(id) });
      if (group) {
        return group;
      } else {
        throw new Error(`Group ${id} not found`);
      }
    },
  },
});

export default Groups;
