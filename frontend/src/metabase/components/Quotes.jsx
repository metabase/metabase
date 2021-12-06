/* eslint-disable react/prop-types */
import React, { Component } from "react";

export default class Quotes extends Component {
  state = {
    count: 0,
  };

  _timer = null;

  static defaultProps = {
    quotes: [],
    period: 1000,
  };

  UNSAFE_componentWillMount() {
    this._timer = setInterval(
      () => this.setState({ count: this.state.count + 1 }),
      this.props.period,
    );
  }
  componentWillUnmount() {
    if (this._timer != null) {
      clearInterval(this._timer);
    }
  }
  render() {
    const { quotes } = this.props;
    const { count } = this.state;
    return <span>{quotes[count % quotes.length]}</span>;
  }
}
