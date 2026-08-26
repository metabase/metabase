import type { CSSProperties, ForwardedRef } from "react";
import { Component, forwardRef } from "react";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { isSameSeries } from "metabase/visualizations/lib/utils";
import type { Series } from "metabase-types/api";

export type CardRendererProps = {
  className?: string;
  style?: CSSProperties;
  series: Series;
  renderer: (
    element: HTMLElement,
    props: CardRendererProps,
  ) => (() => void) | void;
  onRenderError: (error: unknown) => void;
  isEditing?: boolean;
  isDashboard?: boolean;
};

type ExplicitSizeState = {
  width: number | null;
  height: number | null;
};

type CardRendererInnerProps = CardRendererProps &
  ExplicitSizeState & {
    forwardedRef?: ForwardedRef<HTMLDivElement>;
  };

class CardRendererInner extends Component<CardRendererInnerProps> {
  containerRef: HTMLDivElement | null = null;
  _deregister: (() => void) | void = undefined;

  shouldComponentUpdate(nextProps: CardRendererInnerProps) {
    const sameSize =
      this.props.width === nextProps.width &&
      this.props.height === nextProps.height;
    const sameSeries = isSameSeries(this.props.series, nextProps.series);
    return !(sameSize && sameSeries);
  }

  componentDidMount() {
    this.renderChart();
  }

  componentDidUpdate() {
    this.renderChart();
  }

  componentWillUnmount() {
    this._deregisterChart();
  }

  _deregisterChart() {
    if (this._deregister) {
      this._deregister();
      this._deregister = undefined;
    }
  }

  renderChart() {
    const { width, height } = this.props;
    if (width == null || height == null) {
      return;
    }

    const parent = this.containerRef;
    if (!parent) {
      return;
    }

    this._deregisterChart();

    while (parent.firstChild) {
      parent.removeChild(parent.firstChild);
    }

    const element = document.createElement("div");
    parent.appendChild(element);

    try {
      this._deregister = this.props.renderer(element, this.props);
    } catch (err: unknown) {
      console.error(err);
      this.props.onRenderError(
        err instanceof Error ? err.message : (err ?? undefined),
      );
    }
  }

  render() {
    return (
      <div
        className={this.props.className}
        style={this.props.style}
        ref={(element) => {
          this.containerRef = element;

          const fwd = this.props.forwardedRef;
          if (fwd) {
            if (typeof fwd === "function") {
              fwd(element);
            } else {
              fwd.current = element;
            }
          }
        }}
      />
    );
  }
}

const CardRendererWithRef = forwardRef<
  HTMLDivElement,
  CardRendererProps & ExplicitSizeState
>(function _CardRendererWithRef(props, ref) {
  return <CardRendererInner {...props} forwardedRef={ref} />;
});

export const CardRenderer = ExplicitSize<CardRendererProps>({
  wrapped: true,
  // Avoid using debounce when isDashboard=true because there should not be any initial delay when rendering cards
  refreshMode: (props) => (props.isDashboard ? "debounceLeading" : "throttle"),
})(CardRendererWithRef);
