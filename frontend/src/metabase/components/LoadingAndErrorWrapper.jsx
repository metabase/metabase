/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";

import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";
import { t } from "c-3po";
import cx from "classnames";

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

  getErrorMessage() {
    const { error } = this.props;
    let errorMessage =
      // NOTE Atte Keinänen 5/10/17 Dashboard API endpoint returns the error as JSON with `message` field
      (error.data && (error.data.message ? error.data.message : error.data)) ||
      error.statusText ||
      error.message;

    if (!errorMessage || typeof errorMessage === "object") {
      errorMessage = t`An error occured`;
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
      return React.Children.only(this.getChildren());
    }
    return (
      <div className={this.props.className} style={this.props.style}>
        {error ? (
          <div className={contentClassName}>
            <h2 className="text-normal text-grey-2 ie-wrap-content-fix">
              {this.getErrorMessage()}
            </h2>
          </div>
        ) : loading ? (
          <div className={contentClassName}>
            {loadingScenes && loadingScenes[sceneIndex]}
            {!loadingScenes && showSpinner && <LoadingSpinner />}
            <h2 className="text-normal text-grey-2 mt1">
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
