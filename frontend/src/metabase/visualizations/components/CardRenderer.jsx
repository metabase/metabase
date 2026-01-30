/* eslint-disable react/prop-types */
import PropTypes from "prop-types";
import { Component, forwardRef } from "react";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { isSameSeries } from "metabase/visualizations/lib/utils";

class CardRendererInner extends Component {
  static propTypes = {
    className: PropTypes.string,
    series: PropTypes.array.isRequired,
    renderer: PropTypes.func.isRequired,
    onRenderError: PropTypes.func.isRequired,
    isEditing: PropTypes.bool,
    isDashboard: PropTypes.bool,
  };

  containerRef = null;

  shouldComponentUpdate(nextProps) {
    // a chart only needs re-rendering when the result itself changes OR the chart type is different
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
      // Prevents memory leak
      this._deregister();
      delete this._deregister;
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

    // deregister previous chart:
    this._deregisterChart();

    // reset the DOM:
    while (parent.firstChild) {
      parent.removeChild(parent.firstChild);
    }

    // create a new container element
    const element = document.createElement("div");
    parent.appendChild(element);

    try {
      this._deregister = this.props.renderer(element, this.props);
    } catch (err) {
      console.error(err);
      this.props.onRenderError(err.message || err);
    }
  }

  render() {
    return (
      <div
        className={this.props.className}
        style={this.props.style}
        ref={(element) => {
          this.containerRef = element;

          if (this.props.forwardedRef) {
            if (typeof this.props.forwardedRef === "function") {
              this.props.forwardedRef(element);
            } else {
              this.props.forwardedRef.current = element;
            }
          }
        }}
      />
    );
  }
}

const CardRendererWithRef = forwardRef(
  function _CardRendererWithRef(props, ref) {
    return <CardRendererInner {...props} forwardedRef={ref} />;
  },
);

export const CardRenderer = ExplicitSize({
  wrapped: true,
  // Avoid using debounce when isDashboard=true because there should not be any initial delay when rendering cards
  refreshMode: (props) => (props.isDashboard ? "debounceLeading" : "throttle"),
})(CardRendererWithRef);
