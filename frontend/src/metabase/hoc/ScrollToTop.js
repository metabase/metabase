import React from "react";
import { withRouter } from "react-router";

@withRouter
class ScrollToTop extends React.Component {
  componentDidUpdate(prevProps) {
    // Compare location.pathame to see if we're on a different URL. Do this to ensure
    // that query strings don't cause a scroll to the top
    if (this.props.location.pathname !== prevProps.location.pathname) {
      window.scrollTo(0, 0);
    }
  }
  render() {
    return this.props.children;
  }
}

export default ScrollToTop;
