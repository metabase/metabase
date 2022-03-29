import React from "react";
import _ from "underscore";
import MetabaseSettings from "../lib/settings";

const DEFAULT_FAVICON = MetabaseSettings.get("application-favicon-url");
export const LOAD_COMPLETE_FAVICON = "app/assets/img/blue_check.png";

let currentFavicon = DEFAULT_FAVICON;

const updateFavicon = _.debounce(() => {
  document
    .querySelector('link[rel="icon"]')
    .setAttribute("href", currentFavicon);
});

const favicon = faviconSetterOrGetter => ComposedComponent =>
  class extends React.Component {
    static displayName = "Favicon-HoC";

    UNSAFE_componentWillMount() {
      this._updateFavicon();
    }
    componentDidUpdate() {
      this._updateFavicon();
    }
    componentWillUnmount() {
      this._updateFavicon();
    }

    _updateFavicon() {
      if (typeof faviconSetterOrGetter === "string") {
        currentFavicon = faviconSetterOrGetter;
      } else if (typeof faviconSetterOrGetter === "function") {
        const result = faviconSetterOrGetter(this.props);
        if (result == null) {
          currentFavicon = DEFAULT_FAVICON;
        } else if (result instanceof String || typeof result === "string") {
          currentFavicon = result;
        }
      }
      updateFavicon();
    }

    render() {
      return <ComposedComponent {...this.props} />;
    }
  };

export default favicon;
