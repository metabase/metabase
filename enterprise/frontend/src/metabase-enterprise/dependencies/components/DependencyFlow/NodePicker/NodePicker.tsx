import { t } from "ttag";

import { skipToken } from "metabase/api";
import { Button, FixedSizeIcon } from "metabase/ui";
import { useGetDependencyNodeQuery } from "metabase-enterprise/api";
import type { DependencyEntry } from "metabase-types/api";

import { getNodeIcon, getNodeLabel } from "../utils";

type NodePickerProps = {
  entry?: DependencyEntry;
};

export function NodePicker({ entry }: NodePickerProps) {
  const { data: node } = useGetDependencyNodeQuery(
    entry != null ? entry : skipToken,
  );

  return (
    <Button
      variant={node ? "default" : "filled"}
      leftSection={node ? <FixedSizeIcon name={getNodeIcon(node)} /> : null}
    >
      {node ? getNodeLabel(node) : t`Pick your starting data`}
    </Button>
  );
}
