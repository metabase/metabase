import type { State } from "metabase-types/store";

import type { WorkspacesState } from "./workspaces.slice";

export interface WorkspacesStoreState extends State {
  plugins: {
    workspaces: WorkspacesState;
  };
}