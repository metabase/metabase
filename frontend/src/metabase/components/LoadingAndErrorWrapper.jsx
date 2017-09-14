/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";

import cx from "classnames";

export default class LoadingAndErrorWrapper extends Component {

    state = {
        messageIndex: 0,
        loadCount: 0
    }

    static propTypes = {
        className:       PropTypes.string,
        error:           PropTypes.any,
        loading:         PropTypes.any,
        noBackground:    PropTypes.bool,
        noWrapper:       PropTypes.bool,
        children:        PropTypes.any,
        style:           PropTypes.object,
        showSpinner:     PropTypes.bool,
        loadingMessages: PropTypes.array,
        messageInterval: PropTypes.number,
        loadingTimeout:  PropTypes.number
    };

    static defaultProps = {
        className:      "flex flex-full",
        error:          false,
        loading:        false,
        noBackground:   false,
        noWrapper:      false,
        showSpinner:    true,
        loadingMessages: ['Loading...'],
        messageInterval: 6000,
        loadingTimeout: 20000,
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

    componentDidMount () {
        const { loadingMessages, messageInterval } = this.props;
        // only start cycling if multiple messages are provided
        if(loadingMessages.length > 1) {
            this.cycle = setInterval(this.cycleLoadingMessage, messageInterval)
        }
    }

    componentWillUnmount () {
        clearInterval(this.cycle)
    }

    loadingInterval = () => {
        this.setState({ loadCount: this.state.loadCount + 1})
        this.cycleLoadingMessage()
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

    cycleLoadingMessage = () => {
        this.setState({
            messageIndex: this.state.messageIndex + 1 < this.props.loadingMessages.length -1
            ? this.state.messageIndex + 1
            : 0

        })
    }

    render() {
        const {
            loading,
            error,
            noBackground,
            noWrapper,
            showSpinner,
            loadingMessages
        } = this.props;

        const { messageIndex } = this.state;

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
                            { showSpinner && <LoadingSpinner /> }
                            <h2 className="text-normal text-grey-2 mt1">
                                {loadingMessages[messageIndex]}
                            </h2>
                        </div>

                :
                    this.getChildren()
                }
            </div>
        );
    }
}
