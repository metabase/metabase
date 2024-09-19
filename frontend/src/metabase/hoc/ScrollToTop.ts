import { Component, type ReactNode } from "react";
import { type WithRouterProps, withRouter } from "react-router";

interface ScrollToTopInnerProps extends WithRouterProps {
  children: ReactNode;
}

class ScrollToTopInner extends Component<ScrollToTopInnerProps> {
  componentDidUpdate(prevProps: ScrollToTopInnerProps) {
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

const ScrollToTop = withRouter(ScrollToTopInner);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ScrollToTop;
