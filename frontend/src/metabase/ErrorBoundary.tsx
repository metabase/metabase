import React, { ErrorInfo } from "react";

import { SmallGenericError } from "metabase/containers/ErrorPages";

export default class ErrorBoundary extends React.Component<
  {
    onError?: (errorInfo: ErrorInfo) => void;
    errorComponent?: Element;
  },
  {
    hasError: boolean;
    errorDetails: string;
  }
> {
  constructor(props: any) {
    super(props);
    this.state = {
      hasError: false,
      errorDetails: "",
    };
  }

  static getDerivedStateFromError() {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // if we don't provide a specific onError action, the component will display a generic error message
    if (this.props.onError) {
      this.props.onError(errorInfo);
    } else {
      this.setState({
        hasError: true,
        errorDetails: errorInfo.componentStack,
      });
    }
  }

  render() {
    if (this.state.hasError && !this.props.onError) {
      const ErrorComponent = this.props.errorComponent;

      if (!ErrorComponent) {
        return <SmallGenericError />;
      }

      return ErrorComponent;
    }
    return this.props.children;
  }
}
