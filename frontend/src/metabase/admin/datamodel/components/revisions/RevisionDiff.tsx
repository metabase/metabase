import cx from "classnames";
import { Component } from "react";

import CS from "metabase/css/core/index.css";
import type { DatasetQuery } from "metabase-types/api";

import { QueryDiff } from "./QueryDiff";
import { EditIcon, ErrorIcon, SuccessIcon } from "./RevisionDiff.styled";
import { TextDiff } from "./TextDiff";

interface RevisionDiffProps {
  property: string;
  diff: {
    before?: unknown;
    after?: unknown;
  };
  tableId: number;
}

export class RevisionDiff extends Component<RevisionDiffProps> {
  render() {
    const {
      diff: { before, after },
      tableId,
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
              <QueryDiff
                diff={
                  this.props.diff as {
                    before?: DatasetQuery;
                    after?: DatasetQuery;
                  }
                }
                tableId={tableId}
              />
            ) : (
              <TextDiff
                diff={this.props.diff as { before?: string; after?: string }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }
}
