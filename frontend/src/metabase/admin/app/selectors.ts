import { isDeprecatedEngine } from "metabase/lib/engine";
import { Database } from "metabase-types/api";
import { State } from "metabase-types/store";

interface Props {
  databases?: Database[];
}

export const hasSlackBot = (state: State): boolean => {
  return state.settings.values["slack-token"] != null;
};

export const isNoticeEnabled = (state: State): boolean => {
  return state.admin.app.isNoticeEnabled;
};

export const hasDeprecatedDatabase = (state: State, props: Props): boolean => {
  return props.databases?.some(d => isDeprecatedEngine(d.engine)) ?? false;
};
