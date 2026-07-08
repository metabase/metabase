import { Component } from "react";

import { useReportFrontendErrorMutation } from "metabase/api";

interface ChartRenderingErrorBoundaryProps {
  onRenderError: (errorMessage: string) => void;
  children: React.ReactNode;
}

interface ChartRenderingErrorBoundaryInnerProps extends ChartRenderingErrorBoundaryProps {
  onReportError: () => void;
}

class ChartRenderingErrorBoundaryInner extends Component<ChartRenderingErrorBoundaryInnerProps> {
  componentDidCatch(error: any) {
    this.props.onReportError();
    this.props.onRenderError(error.message || error);
  }

  render() {
    return this.props.children;
  }
}

export function ChartRenderingErrorBoundary(
  props: ChartRenderingErrorBoundaryProps,
) {
  const [reportFrontendError] = useReportFrontendErrorMutation();
  return (
    <ChartRenderingErrorBoundaryInner
      {...props}
      onReportError={() =>
        void reportFrontendError({ type: "chart-render-error" })
      }
    />
  );
}
