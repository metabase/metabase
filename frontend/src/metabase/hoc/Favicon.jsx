import { useEffect } from "react";

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

/**
 * @deprecated HOCs are deprecated
 */
const withFavicon = faviconSetterOrGetter => ComposedComponent => {
  const WithFavicon = props => {
    const favicon = resolveFavicon(faviconSetterOrGetter, props);

    useEffect(() => {
      document.querySelector('link[rel="icon"]').setAttribute("href", favicon);
      return () => {
        document
          .querySelector('link[rel="icon"]')
          .setAttribute("href", DEFAULT_FAVICON());
      };
    }, [favicon]);
    return <ComposedComponent {...props} />;
  };
  WithFavicon.displayName = "Favicon";

  return WithFavicon;
};

export default withFavicon;
