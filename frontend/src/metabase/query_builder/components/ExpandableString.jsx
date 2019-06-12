import React, { Component } from "react";
import { t } from "ttag";
import Humanize from "humanize-plus";

export default class ExpandableString extends Component {
  constructor(props, context) {
    super(props, context);
    this.toggleExpansion = this.toggleExpansion.bind(this);

    this.state = {
      expanded: false,
    };
  }

  static defaultProps = {
    length: 140,
  };

  componentWillReceiveProps(newProps) {
    if (newProps.expanded !== undefined) {
      this.setState({
        expanded: newProps.expanded,
      });
    }
  }

  toggleExpansion() {
    this.setState({
      expanded: !this.state.expanded,
    });
  }

  render() {
    if (!this.props.str) {
      return false;
    }

    const truncated = Humanize.truncate(this.props.str || "", 140);

    if (this.state.expanded) {
      return (
        <span>
          {this.props.str}{" "}
          <span
            className="block mt1 link"
            onClick={this.toggleExpansion}
          >{t`View less`}</span>
        </span>
      );
    } else if (truncated !== this.props.str) {
      return (
        <span>
          {truncated}{" "}
          <span
            className="block mt1 link"
            onClick={this.toggleExpansion}
          >{t`View more`}</span>
        </span>
      );
    } else {
      return <span>{this.props.str}</span>;
    }
  }
}
