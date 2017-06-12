/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";

import cx from "classnames";

export default class LoadingAndErrorWrapper extends Component {
    static propTypes = {
        className:      PropTypes.string,
        error:          PropTypes.any,
        loading:        PropTypes.any,
        noBackground:   PropTypes.bool,
        noWrapper:      PropTypes.bool,
        children:       PropTypes.any,
        style:          PropTypes.object
    };

    static defaultProps = {
        className:      "flex flex-full",
        error:          false,
        loading:        false,
        noBackground:   false,
        noWrapper:      false,
    };

    getErrorMessage() {
        const { error } = this.props;
        return (
            // NOTE Atte Keinänen 5/10/17 Dashboard API endpoint returns the error as JSON with `message` field
            error.data && (error.data.message ? error.data.message : error.data) ||
            error.statusText ||
            error.message ||
            "An error occured"
        );
    }

    getChildren() {
        function resolveChild(child) {
            if (Array.isArray(child)) {
                return child.map(resolveChild);
            } else if (typeof child === "function") {
                return child();
            } else {
                return child;
            }
        }
        return resolveChild(this.props.children);
    }

    render() {
        const { loading, error, noBackground, noWrapper } = this.props;
        const contentClassName = cx("wrapper py4 text-brand text-centered flex-full flex flex-column layout-centered", {
            "bg-white": !noBackground
        });
        if (noWrapper && !error && !loading) {
            return React.Children.only(this.getChildren());
        }
        return (
            <div className={this.props.className} style={this.props.style}>
                { error ?
                    <div className={contentClassName}>
                        <h2 className="text-normal text-grey-2 ie-wrap-content-fix">{this.getErrorMessage()}</h2>
                    </div>
                : loading ?
                    <div className={contentClassName}>
                        <LoadingSpinner />
                        <h2 className="text-normal text-grey-2 mt1">Loading...</h2>
                     </div>
                :
                    this.getChildren()
                }
            </div>
        );
    }
}
