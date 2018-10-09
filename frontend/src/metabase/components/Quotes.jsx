/* @flow */

import React, { Component } from "react";

type Props = {
  period: number,
  quotes: string[],
};
type State = {
  count: number,
};

export default class Quotes extends Component {
  props: Props;
  state: State = {
    count: 0,
  };

  _timer: ?number = null;

  static defaultProps = {
    quotes: [],
    period: 1000,
  };

  componentWillMount() {
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
