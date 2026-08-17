import { isDeprecatedEngine } from "metabase/databases/utils/engine";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";
import type { Database } from "metabase-types/api";

interface Props {
  databases?: Pick<Database, "is_sample" | "engine">[];
}

export const hasDeprecatedDatabase = (state: State, props: Props): boolean => {
  const engines = getSetting(state, "engines");
  return (
    props.databases?.some(
      (d) => !d.is_sample && d.engine && isDeprecatedEngine(engines, d.engine),
    ) ?? false
  );
};

export const isDeprecationNoticeEnabled = (state: State): boolean => {
  // check if the deprecation notice has been dismissed on this version
  return (
    getSetting(state, "version")?.tag !==
    getSetting(state, "deprecation-notice-version")
  );
};

export const getCurrentVersion = (state: State) =>
  getSetting(state, "version")?.tag ?? "";
