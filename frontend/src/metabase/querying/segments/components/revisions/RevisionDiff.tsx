import cx from "classnames";

import CS from "metabase/css/core/index.css";
import type { FieldDiff, RevisionDiffKey, TableId } from "metabase-types/api";
import { isQueryDiff } from "metabase-types/guards";

import { QueryDiff } from "./QueryDiff";
import { RevisionDiffIcon } from "./RevisionDiffIcon";
import { TextDiff } from "./TextDiff";

interface Props {
  diff: FieldDiff;
  property: RevisionDiffKey;
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
          {property === "definition" && isQueryDiff(diff) ? (
            <QueryDiff diff={diff} tableId={tableId} />
          ) : (
            <TextDiff diff={diff} />
          )}
        </div>
      </div>
    </div>
  );
}
