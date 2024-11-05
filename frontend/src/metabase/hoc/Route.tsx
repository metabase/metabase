import { cloneElement } from "react";
import { Route as _Route } from "react-router";
import _ from "underscore";

import { useRegisterMetabotContextProvider } from "metabase/metabot";

import title from "./Title";

function metabot(ComposedComponent: React.ComponentType<any>) {
  return function MetabotRouteContext(props: any) {
    const { name, description } = props.route;

    useRegisterMetabotContextProvider(() => {
      if (!name) {
        return;
      }
      return {
        current_page: {
          name,
          ...(description ? { description } : {}),
        },
      };
    }, [name, description]);

    return <ComposedComponent {...props} />;
  };
}

// react-router Route wrapper that adds a `title` property
export class Route extends _Route {
  static createRouteFromReactElement(element: any) {
    const baseComponent = metabot(
      element.props.component || (({ children }) => children),
    );

    const component = element.props.title
      ? title(element.props.title)(baseComponent)
      : baseComponent;

    return (_Route as any).createRouteFromReactElement(
      cloneElement(element, { component }),
    );
  }
}
