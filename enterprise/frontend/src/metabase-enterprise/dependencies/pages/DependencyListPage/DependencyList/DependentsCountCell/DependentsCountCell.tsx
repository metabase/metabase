import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";
import { Anchor } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeDependentsCount } from "../../../../utils";

type DependentsCountCellProps = {
  node: DependencyNode;
};

export function DependentsCountCell({ node }: DependentsCountCellProps) {
  const count = getNodeDependentsCount(node);
  const url = Urls.dependencyGraph({ entry: node });

  return (
    <Anchor component={Link} to={url}>
      {count}
    </Anchor>
  );
}
