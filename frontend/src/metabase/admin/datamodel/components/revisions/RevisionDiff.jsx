import { Component } from "react";
import PropTypes from "prop-types";

import TextDiff from "./TextDiff";
import QueryDiff from "./QueryDiff";
import { EditIcon, ErrorIcon, SuccessIcon } from "./RevisionDiff.styled";

export default class RevisionDiff extends Component {
  static propTypes = {
    property: PropTypes.string.isRequired,
    diff: PropTypes.object.isRequired,
    tableMetadata: PropTypes.object.isRequired,
  };

  render() {
    const {
      diff: { before, after },
      tableMetadata,
    } = this.props;

    let icon;
    if (before != null && after != null) {
      icon = <EditIcon name="pencil" size={16} />;
    } else if (before != null) {
      icon = <ErrorIcon name="add" size={16} />;
    } else {
      // TODO: "minus" icon
      icon = <SuccessIcon name="add" size={16} />;
    }

    return (
      <div
        className="bordered rounded my2"
        style={{ borderWidth: 2, overflow: "hidden", maxWidth: 860 }}
      >
        <div className="flex align-center scroll-x scroll-show scroll-show-horizontal">
          <div className="m3" style={{ lineHeight: 0 }}>
            {icon}
          </div>
          <div>
            {this.props.property === "definition" ? (
              <QueryDiff diff={this.props.diff} tableMetadata={tableMetadata} />
            ) : (
              <TextDiff diff={this.props.diff} />
            )}
          </div>
        </div>
      </div>
    );
  }
}
