import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";

import CS from "metabase/css/core/index.css";

import QueryDiff from "./QueryDiff";
import { EditIcon, ErrorIcon, SuccessIcon } from "./RevisionDiff.styled";
import TextDiff from "./TextDiff";

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
        className={cx(CS.bordered, CS.rounded, CS.my2)}
        style={{ borderWidth: 2, overflow: "hidden", maxWidth: 860 }}
      >
        <div className={cx(CS.flex, CS.alignCenter, CS.scrollX, CS.scrollShow)}>
          <div className={CS.m3} style={{ lineHeight: 0 }}>
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
