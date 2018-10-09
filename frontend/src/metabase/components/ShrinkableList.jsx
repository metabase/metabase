/* @flow */

import React, { Component } from "react";
import ReactDOM from "react-dom";

import ExplicitSize from "metabase/components/ExplicitSize";

type Props = {
  className?: string,
  items: any[],
  renderItem: (item: any) => any,
  renderItemSmall: (item: any) => any,
};

type State = {
  isShrunk: ?boolean,
};

@ExplicitSize()
export default class ShrinkableList extends Component {
  props: Props;
  state: State = {
    isShrunk: null,
  };

  componentWillReceiveProps() {
    this.setState({
      isShrunk: null,
    });
  }

  componentDidMount() {
    this.componentDidUpdate();
  }

  componentDidUpdate() {
    const container = ReactDOM.findDOMNode(this);
    const { isShrunk } = this.state;
    if (container && isShrunk === null) {
      this.setState({
        isShrunk: container.scrollWidth !== container.offsetWidth,
      });
    }
  }

  render() {
    const { items, className, renderItemSmall, renderItem } = this.props;
    const { isShrunk } = this.state;
    return (
      <div className={className}>
        {items.map(
          item => (isShrunk ? renderItemSmall(item) : renderItem(item)),
        )}
      </div>
    );
  }
}
