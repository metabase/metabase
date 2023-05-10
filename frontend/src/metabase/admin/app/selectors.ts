import { isDeprecatedEngine } from "metabase/lib/engine";
import { getSetting } from "metabase/selectors/settings";
import type { State } from "metabase-types/store";
import type Database from "metabase-lib/metadata/Database";

interface Props {
  databases?: Database[];
}

export const hasSlackBot = (state: State): boolean => {
  return getSetting(state, "slack-token") != null;
};

export const isNoticeEnabled = (state: State): boolean => {
  return state.admin.app.isNoticeEnabled;
};

export const hasDeprecatedDatabase = (state: State, props: Props): boolean => {
  return props.databases?.some(d => isDeprecatedEngine(d.engine)) ?? false;
};

export const getAdminPaths = (state: State) => {
  return state.admin?.app?.paths ?? [];
};

export const canAccessAdmin = (state: State): boolean => {
  return getAdminPaths(state).length > 0;
};

export const canAccessPath = (
  state: State,
  { key }: { key: string },
): boolean => {
  return state.admin.app.paths?.find(path => path.key === key) != null;
};
