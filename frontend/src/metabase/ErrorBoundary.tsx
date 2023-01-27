import React, { ErrorInfo } from "react";

import { SmallGenericError } from "metabase/containers/ErrorPages";

export default class ErrorBoundary extends React.Component<
  {
    onError: (errorInfo: ErrorInfo) => void;
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
    if (this.state.hasError) {
      return <SmallGenericError details={this.state.errorDetails} />;
    }
    return this.props.children;
  }
}
