import React from "react";

import _ from "underscore";

const componentStack = [];

const updateDocumentTitle = _.debounce(() => {
    // update with the top-most title
    for (let i = componentStack.length - 1; i >= 0; i--) {
        const title = componentStack[i]._documentTitle;
        if (title) {
            if (document.title !== title) {
                document.title = title;
            }
            break;
        }
    }
})

const title = (documentTitleOrGetter) => (ComposedComponent) =>
    class extends React.Component {
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
                this._documentTitle = documentTitleOrGetter(this.props);
            }
            updateDocumentTitle();
        }

        render() {
            return <ComposedComponent {...this.props} />;
        }
    }

export default title;

import { Route as _Route } from "react-router";

// react-router Route wrapper that adds a `title` property
export class Route extends _Route {
    static createRouteFromReactElement(element) {
        if (element.props.component && element.props.title) {
            element = React.cloneElement(element, {
                component: title(element.props.title)(element.props.component)
            });
        }
        return _Route.createRouteFromReactElement(element);
    }
}
