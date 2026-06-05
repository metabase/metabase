import { Component } from "react";

import { FrontendErrorsApi } from "metabase/services";

interface ChartRenderingErrorBoundaryProps {
  onRenderError: (errorMessage: string) => void;
  children: React.ReactNode;
}

export class ChartRenderingErrorBoundary extends Component<ChartRenderingErrorBoundaryProps> {
  constructor(props: ChartRenderingErrorBoundaryProps) {
    super(props);
  }

  componentDidCatch(error: any) {
    FrontendErrorsApi.report({ type: "chart-render-error" }).catch(() => {});
    this.props.onRenderError(error.message || error);
  }

  render() {
    return this.props.children;
  }
}
