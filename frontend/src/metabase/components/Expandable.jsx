import React, { Component } from "react";
import PropTypes from "prop-types";

const Expandable = ComposedComponent =>
  class extends Component {
    static displayName =
      "Expandable[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";

    constructor(props, context) {
      super(props, context);
      this.state = {
        expanded: false,
      };
      this.expand = () => this.setState({ expanded: true });
    }

    static propTypes = {
      items: PropTypes.array.isRequired,
      initialItemLimit: PropTypes.number.isRequired,
    };
    static defaultProps = {
      initialItemLimit: 4,
    };

    render() {
      let { expanded } = this.state;
      let { items, initialItemLimit } = this.props;
      if (items.length > initialItemLimit && !expanded) {
        items = items.slice(0, initialItemLimit - 1);
      }
      expanded = items.length >= this.props.items.length;
      return (
        <ComposedComponent
          {...this.props}
          isExpanded={expanded}
          onExpand={this.expand}
          items={items}
        />
      );
    }
  };

export default Expandable;
