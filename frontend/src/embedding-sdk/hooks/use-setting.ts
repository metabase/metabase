import type { SettingKey, Settings } from "metabase-types/api";
import type { State } from "metabase-types/store";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

export const useSetting = <T extends SettingKey>(key: T): Settings[T] =>
  useSelector((state: State) => getSetting(state, key));
