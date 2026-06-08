import type { ReactNode } from "react";
import { Component } from "react";
import { type WithRouterProps, withRouter } from "react-router";

interface ScrollToTopProps {
  children?: ReactNode;
}

class ScrollToTopInner extends Component<ScrollToTopProps & WithRouterProps> {
  componentDidUpdate(prevProps: ScrollToTopProps & WithRouterProps) {
    // Compare location.pathname to see if we're on a different URL. Do this to ensure
    // that query strings don't cause a scroll to the top
    if (this.props.location.pathname !== prevProps.location.pathname) {
      window.scrollTo(0, 0);
    }
  }
  render() {
    return this.props.children;
  }
}

const ScrollToTop = withRouter(ScrollToTopInner);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ScrollToTop;
