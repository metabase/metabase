import { useFavicon as useFaviconMantineHook } from "@mantine/hooks";

import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

export const LOAD_COMPLETE_FAVICON = "app/assets/img/blue_check.png";

export const useFavicon = ({ favicon }) => {
  const defaultFavicon = useSelector(state =>
    getSetting(state, "application-favicon-url"),
  );

  useFaviconMantineHook(favicon ?? defaultFavicon);
};
