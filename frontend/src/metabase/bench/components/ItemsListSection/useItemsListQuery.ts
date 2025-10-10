import type { Location, Query } from "history";
import { replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";

import type {
  ItemsListSetting,
  ItemsListSettingsProps,
} from "./ItemsListSettings";

export const useItemsListQuery = ({
  settings,
  defaults,
  location,
}: {
  settings: ItemsListSetting[];
  defaults: Query;
  location: Location;
}): ItemsListSettingsProps => {
  const dispatch = useDispatch();
  const values = { ...defaults, ...location.query };

  return {
    settings,
    values,
    onSettingChange: (setting, value) => {
      dispatch(
        replace({
          ...location,
          query: {
            ...location.query,
            [setting.name]:
              value === defaults[setting.name] ? undefined : value,
          },
        }),
      );
    },
  };
};
