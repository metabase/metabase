import React, { Component } from "react";
import PropTypes from "prop-types";

type Props<T> = T & PropTypes.InferProps<typeof propTypes>;

type State = {
  expanded: boolean,
}

const Expandable = <T extends unknown>(ComposedComponent: React.ComponentType<T>) =>
  class extends Component<Props<T>, State> {
    static displayName =
      "Expandable[" +
      (ComposedComponent.displayName || ComposedComponent.name) +
      "]";

    constructor(props: Props<T>, context: any) {
      super(props, context);
      this.state = {
        expanded: false,
      };
    }

    expand = () => this.setState({ expanded: true });

    static propTypes = propTypes;

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

const propTypes = {
  items: PropTypes.array.isRequired,
  initialItemLimit: PropTypes.number.isRequired,
};

export default Expandable;
