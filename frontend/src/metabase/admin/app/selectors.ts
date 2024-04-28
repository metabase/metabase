import { isDeprecatedEngine } from "metabase/lib/engine";
import { getSetting } from "metabase/selectors/settings";
import type Database from "metabase-lib/v1/metadata/Database";
import type { State } from "metabase-types/store";

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
  return (
    props.databases?.some(d => !d.is_sample && isDeprecatedEngine(d.engine)) ??
    false
  );
};

export const getAdminPaths = (state: State) => {
  return state.admin?.app?.paths ?? [];
};
