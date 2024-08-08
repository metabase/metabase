import type { ErrorInfo, ComponentType, ReactNode } from "react";
import { Component } from "react";

import { SmallGenericError } from "metabase/components/ErrorPages";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class ErrorBoundary extends Component<
  {
    onError?: (errorInfo: ErrorInfo) => void;
    errorComponent?: ComponentType;
    message?: string;
    children: ReactNode;
  },
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
      return <ErrorComponent message={this.props.message} />;
    }

    return this.props.children;
  }
}
