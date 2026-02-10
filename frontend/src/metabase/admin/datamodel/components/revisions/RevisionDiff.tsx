import cx from "classnames";

import CS from "metabase/css/core/index.css";
import type { DatasetQuery, TableId } from "metabase-types/api";

import { QueryDiff } from "./QueryDiff";
import { RevisionDiffIcon } from "./RevisionDiffIcon";
import { TextDiff } from "./TextDiff";

interface Props {
  diff: {
    before?: DatasetQuery;
    after?: DatasetQuery;
  };
  property: string;
  tableId: TableId;
}

export function RevisionDiff({ diff, property, tableId }: Props) {
  return (
    <div
      className={cx(CS.bordered, CS.rounded, CS.my2)}
      style={{ borderWidth: 2, overflow: "hidden", maxWidth: 860 }}
    >
      <div className={cx(CS.flex, CS.alignCenter, CS.scrollX, CS.scrollShow)}>
        <div className={CS.m3} style={{ lineHeight: 0 }}>
          <RevisionDiffIcon diff={diff} />
        </div>

        <div>
          {property === "definition" ? (
            <QueryDiff diff={diff} tableId={tableId} />
          ) : (
            <TextDiff diff={diff} />
          )}
        </div>
      </div>
    </div>
  );
}
