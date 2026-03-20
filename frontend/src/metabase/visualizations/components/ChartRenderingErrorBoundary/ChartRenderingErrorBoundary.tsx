import { Component } from "react";

interface ChartRenderingErrorBoundaryProps {
  onRenderError: (errorMessage: string) => void;
  children: React.ReactNode;
}

export class ChartRenderingErrorBoundary extends Component<ChartRenderingErrorBoundaryProps> {
  constructor(props: ChartRenderingErrorBoundaryProps) {
    super(props);
  }

  componentDidCatch(error: any) {
    fetch("/api/frontend-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: "render-chart" }),
    }).catch(() => {});
    this.props.onRenderError(error.message || error);
  }

  render() {
    return this.props.children;
  }
}
