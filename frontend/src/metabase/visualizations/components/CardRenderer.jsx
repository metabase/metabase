/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";

import { isSameSeries } from "metabase/visualizations/lib/utils";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

type DeregisterFunction = () => void;

type Props = VisualizationProps & {
  renderer: (element: Element, props: VisualizationProps) => DeregisterFunction,
};

@ExplicitSize
export default class CardRenderer extends Component {
  props: Props;

  static propTypes = {
    className: PropTypes.string,
    series: PropTypes.array.isRequired,
    renderer: PropTypes.func.isRequired,
    onRenderError: PropTypes.func.isRequired,
  };

  _deregister: ?DeregisterFunction;

  shouldComponentUpdate(nextProps: Props) {
    // a chart only needs re-rendering when the result itself changes OR the chart type is different
    let sameSize =
      // $FlowFixMe: width/height provided by ExplicitSize
      this.props.width === nextProps.width &&
      // $FlowFixMe: width/height provided by ExplicitSize
      this.props.height === nextProps.height;
    let sameSeries = isSameSeries(this.props.series, nextProps.series);
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
    // $FlowFixMe: width/height provided by ExplicitSize
    if (this.props.width == null || this.props.height == null) {
      return;
    }

    let parent = ReactDOM.findDOMNode(this);

    // deregister previous chart:
    this._deregisterChart();

    // reset the DOM:
    let element = parent.firstChild;
    if (element) {
      parent.removeChild(element);
    }

    // create a new container element
    element = document.createElement("div");
    parent.appendChild(element);

    try {
      this._deregister = this.props.renderer(element, this.props);
    } catch (err) {
      console.error(err);
      this.props.onRenderError(err.message || err);
    }
  }

  render() {
    return <div className={this.props.className} />;
  }
}
