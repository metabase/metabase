import React, { Component, PropTypes } from "react";

import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";

export default class LoadingAndErrorWrapper extends Component {
    static propTypes = {
        className: PropTypes.any,
        error: PropTypes.any,
        loading: PropTypes.any
    };

    getErrorMessage() {
        return (
            this.props.error.data ||
            this.props.error.statusText ||
            this.props.error.message ||
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
        return (
            <div className={this.props.className}>
                { this.props.error ?
                    <div className="wrapper py4 text-brand text-centered flex-full bg-white">
                        <h2 className="text-normal text-grey-2">{this.getErrorMessage()}</h2>
                    </div>
                : this.props.loading ?
                    <div className="wrapper py4 text-brand text-centered flex-full bg-white">
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
