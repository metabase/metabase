import type {
  ComponentType,
  ErrorInfo,
  ForwardedRef,
  PropsWithChildren,
} from "react";
import { Component, forwardRef } from "react";

import { SmallGenericError } from "metabase/components/ErrorPages";

interface ErrorBoundaryProps extends PropsWithChildren {
  onError?: (errorInfo: ErrorInfo) => void;
  errorComponent?: ComponentType;
  message?: string;
  forwardedRef?: ForwardedRef<HTMLDivElement>;
}

class ErrorBoundaryInner extends Component<
  ErrorBoundaryProps,
  {
    hasError: boolean;
  }
> {
  constructor(props: any) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError() {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(error, errorInfo);
    // if we don't provide a specific onError action, the component will display a generic error message
    if (this.props.onError) {
      this.props.onError(errorInfo);
      this.setState({
        hasError: false,
      });
    }
  }

  render() {
    if (this.state.hasError) {
      const ErrorComponent = this.props.errorComponent
        ? this.props.errorComponent
        : SmallGenericError;
      return (
        <ErrorComponent
          ref={this.props.forwardedRef}
          message={this.props.message}
          data-testid="error-boundary"
        />
      );
    }

    return this.props.children;
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default forwardRef<HTMLDivElement, ErrorBoundaryProps>(
  function ErrorBoundary(props, ref) {
    return <ErrorBoundaryInner {...props} forwardedRef={ref} />;
  },
);
