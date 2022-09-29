/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import cx from "classnames";
import LoadingSpinner from "metabase/components/LoadingSpinner";

export default class LoadingAndErrorWrapper extends Component {
  state = {
    messageIndex: 0,
    sceneIndex: 0,
  };

  static propTypes = {
    className: PropTypes.string,
    error: PropTypes.any,
    loading: PropTypes.any,
    noBackground: PropTypes.bool,
    noWrapper: PropTypes.bool,
    children: PropTypes.any,
    style: PropTypes.object,
    showSpinner: PropTypes.bool,
    loadingMessages: PropTypes.array,
    messageInterval: PropTypes.number,
    loadingScenes: PropTypes.array,
    renderError: PropTypes.func,
  };

  static defaultProps = {
    error: false,
    loading: false,
    noBackground: true,
    noWrapper: false,
    showSpinner: true,
    loadingMessages: [t`Loading...`],
    messageInterval: 6000,
  };

  renderError(contentClassName) {
    if (this.props.renderError) {
      return (
        <div className="py4">
          {this.props.renderError(this.getErrorMessage())}
        </div>
      );
    }

    return (
      <div className={contentClassName}>
        <h2 className="text-normal text-light ie-wrap-content-fix">
          {this.getErrorMessage()}
        </h2>
      </div>
    );
  }

  getErrorMessage() {
    const { error } = this.props;
    let errorMessage =
      // NOTE Atte Keinänen 5/10/17 Dashboard API endpoint returns the error as JSON with `message` field
      (error.data && (error.data.message ? error.data.message : error.data)) ||
      error.statusText ||
      error.message ||
      error;

    if (!errorMessage || typeof errorMessage !== "string") {
      errorMessage = t`An error occurred`;
    }
    return errorMessage;
  }

  componentDidMount() {
    const { loadingMessages, messageInterval } = this.props;
    // only start cycling if multiple messages are provided
    if (loadingMessages.length > 1) {
      this.cycle = setInterval(this.loadingInterval, messageInterval);
    }
  }

  componentWillUnmount() {
    clearInterval(this.cycle);
  }

  loadingInterval = () => {
    if (this.props.loading) {
      this.cycleLoadingMessage();
    }
  };

  getChildren(child = this.props.children) {
    if (Array.isArray(child)) {
      return child.map(this.getChildren);
    } else if (typeof child === "function") {
      return child();
    } else {
      return child;
    }
  }

  cycleLoadingMessage = () => {
    this.setState({
      messageIndex:
        this.state.messageIndex + 1 < this.props.loadingMessages.length
          ? this.state.messageIndex + 1
          : 0,
    });
  };

  render() {
    const {
      loading,
      error,
      noBackground,
      noWrapper,
      showSpinner,
      loadingMessages,
      loadingScenes,
    } = this.props;

    const { messageIndex, sceneIndex } = this.state;

    const contentClassName = cx(
      "wrapper py4 text-brand text-centered flex-full flex flex-column layout-centered",
      { "bg-white": !noBackground },
    );

    if (noWrapper && !error && !loading) {
      const children = this.getChildren();
      // special case for loading wrapper with null/undefined child
      if (children == null) {
        return null;
      }
      return React.Children.only(children);
    }
    return (
      <div className={this.props.className} style={this.props.style}>
        {error ? (
          this.renderError(contentClassName)
        ) : loading ? (
          <div className={contentClassName}>
            {loadingScenes && loadingScenes[sceneIndex]}
            {!loadingScenes && showSpinner && <LoadingSpinner />}
            <h2 className="text-normal text-light mt1">
              {loadingMessages[messageIndex]}
            </h2>
          </div>
        ) : (
          this.getChildren()
        )}
      </div>
    );
  }
}
