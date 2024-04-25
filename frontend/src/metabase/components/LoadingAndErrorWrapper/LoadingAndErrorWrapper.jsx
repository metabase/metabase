/* eslint "react/prop-types": "warn" */
import cx from "classnames";
import PropTypes from "prop-types";
import { Children, Component } from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import CS from "metabase/css/core/index.css";

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
    "data-testid": PropTypes.string,
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
        <div className={CS.py4}>
          {this.props.renderError(this.getErrorMessage())}
        </div>
      );
    }

    return (
      <div className={contentClassName}>
        <h2 className={cx(CS.textNormal, CS.textLight, CS.ieWrapContentFix)}>
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
      style,
      className,
      "data-testid": testId,
    } = this.props;

    const { messageIndex, sceneIndex } = this.state;

    const contentClassName = cx(
      CS.wrapper,
      CS.py4,
      CS.textBrand,
      CS.textCentered,
      CS.flexFull,
      CS.flex,
      CS.flexColumn,
      CS.layoutCentered,
      { [CS.bgWhite]: !noBackground },
    );

    if (noWrapper && !error && !loading) {
      const children = this.getChildren();
      // special case for loading wrapper with null/undefined child
      if (children == null) {
        return null;
      }
      return Children.only(children);
    }
    return (
      <div className={className} style={style} data-testid={testId}>
        {error ? (
          this.renderError(contentClassName)
        ) : loading ? (
          <div className={contentClassName}>
            {loadingScenes && loadingScenes[sceneIndex]}
            {!loadingScenes && showSpinner && <LoadingSpinner />}
            <h2 className={cx(CS.textNormal, CS.textLight, CS.mt1)}>
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
