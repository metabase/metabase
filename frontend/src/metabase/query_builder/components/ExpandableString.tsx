import cx from "classnames";
import Humanize from "humanize-plus";
import type { MouseEvent } from "react";
import { Component } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";

interface ExpandableStringProps {
  str?: string;
  length?: number;
  expanded?: boolean;
}

interface ExpandableStringState {
  expanded: boolean;
}

export class ExpandableString extends Component<
  ExpandableStringProps,
  ExpandableStringState
> {
  static defaultProps = {
    length: 140,
  };

  constructor(props: ExpandableStringProps) {
    super(props);
    this.state = {
      expanded: false,
    };
  }

  UNSAFE_componentWillReceiveProps(newProps: ExpandableStringProps) {
    if (newProps.expanded !== undefined) {
      this.setState({
        expanded: newProps.expanded,
      });
    }
  }

  toggleExpansion = (event: MouseEvent) => {
    event.stopPropagation();
    this.setState({
      expanded: !this.state.expanded,
    });
  };

  render() {
    if (!this.props.str) {
      return null;
    }

    const truncated = Humanize.truncate(this.props.str || "", 140);

    if (this.state.expanded) {
      return (
        <span>
          {this.props.str}{" "}
          <span
            className={cx(CS.block, CS.mt1, CS.link)}
            onClick={this.toggleExpansion}
          >{t`View less`}</span>
        </span>
      );
    } else if (truncated !== this.props.str) {
      return (
        <span>
          {truncated}{" "}
          <span
            className={cx(CS.block, CS.mt1, CS.link)}
            onClick={this.toggleExpansion}
          >{t`View more`}</span>
        </span>
      );
    } else {
      return <span>{this.props.str}</span>;
    }
  }
}
