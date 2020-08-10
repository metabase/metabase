import React from "react";

import _ from "underscore";

const componentStack = [];

const SEPARATOR = " · ";

const updateDocumentTitle = _.debounce(() => {
  document.title = componentStack
    .map(component => component._documentTitle)
    .filter(title => title)
    .reverse()
    .join(SEPARATOR);
});

const title = documentTitleOrGetter => ComposedComponent =>
  class extends React.Component {
    static displayName =
      "Title[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";

    componentWillMount() {
      componentStack.push(this);
      this._updateDocumentTitle();
    }
    componentDidUpdate() {
      this._updateDocumentTitle();
    }
    componentWillUnmount() {
      for (let i = 0; i < componentStack.length; i++) {
        if (componentStack[i] === this) {
          componentStack.splice(i, 1);
          break;
        }
      }
      this._updateDocumentTitle();
    }

    _updateDocumentTitle() {
      if (typeof documentTitleOrGetter === "string") {
        this._documentTitle = documentTitleOrGetter;
      } else if (typeof documentTitleOrGetter === "function") {
        const result = documentTitleOrGetter(this.props);
        if (result == null) {
          // title functions might return null before data is loaded
          this._documentTitle = "";
        } else if (result instanceof String || typeof result === "string") {
          this._documentTitle = result;
        } else if (typeof result === "object") {
          // The getter can return an object with a `refresh` promise along with
          // the title. When that promise resolves, we call
          // `documentTitleOrGetter` again.
          this._documentTitle = result.title;
          result.refresh.then(() => this._updateDocumentTitle());
        }
      }
      updateDocumentTitle();
    }

    render() {
      return <ComposedComponent {...this.props} />;
    }
  };

export default title;

import { Route as _Route } from "react-router";

// react-router Route wrapper that adds a `title` property
export class Route extends _Route {
  static createRouteFromReactElement(element) {
    if (element.props.title) {
      element = React.cloneElement(element, {
        component: title(element.props.title)(
          element.props.component || (({ children }) => children),
        ),
      });
    }
    return _Route.createRouteFromReactElement(element);
  }
}
