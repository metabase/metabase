import { msgid, ngettext } from "ttag";

import type { DependencyNode } from "metabase-types/api";

type ErrorCellProps = {
  node: DependencyNode;
};

export function ErrorCell({ node }: ErrorCellProps) {
  const errors = node.errors ?? [];
  return (
    <>
      {ngettext(
        msgid`${errors.length} error`,
        `${errors.length} errors`,
        errors.length,
      )}
    </>
  );
}
