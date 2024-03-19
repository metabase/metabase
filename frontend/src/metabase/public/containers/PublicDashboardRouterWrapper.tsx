import type { Location } from "history";
import {useEffect} from "react";
import { PublicDashboard } from "metabase/public/containers/PublicDashboard";
import {setOptions} from "metabase/redux/embed";
import {parseHashOptions, parseSearchOptions} from "metabase/lib/browser";
import {isWithinIframe} from "metabase/lib/dom";
import {useDispatch} from "metabase/lib/redux";
import type {SuperDuperEmbedOptions} from "metabase/public/components/EmbedFrame/types";

const themeTypeGuard = (theme: string | string[] | undefined): theme is "light" | "night" | "transparent" => {
  if (Array.isArray(theme)) {
    return false;
  }
  return theme === "light" || theme === "night" || theme === "transparent";
}

export const PublicDashboardRouterWrapper = ({
  location,
  params: { uuid, tabSlug, token },
  ...rest
}: {
  location: Location;
  params: { uuid: string; tabSlug: string, token: string };
  rest: any;
}) => {

  // useSyncURLSlug({ location });

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setOptions({
      ...parseSearchOptions(location.search),
      ...parseHashOptions(location.hash),
    }),);
  }, [dispatch, location]);


  const {
    bordered = isWithinIframe(),
    titled = true,
    theme,
    hide_parameters,
    hide_download_button,
  } = parseHashOptions(location.hash);

  const embedOptions: SuperDuperEmbedOptions = {
    font: "Lato",
    bordered: Boolean(bordered),
    titled: Boolean(titled),
    theme: themeTypeGuard(theme) ? theme : "light",
    hide_parameters: Boolean(hide_parameters),
    hide_download_button: Boolean(hide_download_button),
  }

  return (
    <PublicDashboard
      uuid={uuid}
      token={token}
      parameterSelection={location.query}
      embedOptions={embedOptions}
    />
  );
};
