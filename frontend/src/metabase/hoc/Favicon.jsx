import React, { useEffect } from "react";
import _ from "underscore";
import MetabaseSettings from "../lib/settings";

const DEFAULT_FAVICON = () => MetabaseSettings.get("application-favicon-url");
export const LOAD_COMPLETE_FAVICON = "app/assets/img/blue_check.png";

const resolveFavicon = (setterOrGetter, props) => {
  if (typeof setterOrGetter === "string") {
    return setterOrGetter;
  } else if (typeof setterOrGetter === "function") {
    const result = setterOrGetter(props);
    if (result == null) {
      return DEFAULT_FAVICON();
    } else if (result instanceof String || typeof result === "string") {
      return result;
    }
  }
};

const withFavicon = faviconSetterOrGetter => ComposedComponent => props => {
  const favicon = resolveFavicon(faviconSetterOrGetter, props);

  useEffect(() => {
    document.querySelector('link[rel="icon"]').setAttribute("href", favicon);
  }, [favicon]);

  function WithFavicon(props) {
    return <ComposedComponent {...props} />;
  }

  WithFavicon.displayName = "test";

  return WithFavicon;
};

export default withFavicon;
