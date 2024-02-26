import type { ReactNode } from "react";
import { Component } from "react";
import type { IconName } from "metabase/ui";
import { ErrorView } from "../Visualization/ErrorView";

export class VizErrorBoundary extends Component<
  {
    errorIcon: IconName;
    small: boolean;
    isDashboard: boolean;
  },
  {
    error: Error | null;
  }
> {
  constructor(props: any) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <ErrorView
          error={this.state.error.message}
          icon={this.props.errorIcon}
          isSmall={this.props.small}
          isDashboard={this.props.isDashboard}
        />
      );
    }

    return this.props.children;
  }
}
