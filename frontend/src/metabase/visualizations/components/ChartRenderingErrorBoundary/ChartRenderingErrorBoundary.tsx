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
    this.props.onRenderError(error.message || error);
  }

  render() {
    return this.props.children;
  }
}
