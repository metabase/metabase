/* @flow */

import type { QueryMode } from "metabase/meta/types/Visualization";

import { PLUGIN_DRILLS } from "metabase/plugins";

const PublicMode: QueryMode = {
  name: "public",
  drills: () => PLUGIN_DRILLS,
};

export default PublicMode;
