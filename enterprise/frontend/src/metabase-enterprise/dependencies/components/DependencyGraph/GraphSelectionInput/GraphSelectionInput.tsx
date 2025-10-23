import { useDisclosure } from "@mantine/hooks";
import { useReactFlow } from "@xyflow/react";
import { useMemo } from "react";
import { t } from "ttag";

import { Button, Card, FixedSizeIcon, Select, Tooltip } from "metabase/ui";

import { TOOLTIP_OPEN_DELAY } from "../constants";
import type { NodeType } from "../types";
import { getNodeIcon, getNodeLabel } from "../utils";

type GraphSelectInputProps = {
  nodes: NodeType[];
};

export function GraphSelectInput({ nodes }: GraphSelectInputProps) {
  const { fitView } = useReactFlow();
  const data = useMemo(() => getSelectItems(nodes), [nodes]);
  const [isOpened, { open, close }] = useDisclosure(false);

  const handleChange = (value: string | null) => {
    const selectedNode = nodes.find((node) => node.id === value);
    if (selectedNode != null) {
      fitView({ nodes: [selectedNode] });
    }
  };

  return (
    <Card p={0} bdrs={0}>
      {isOpened ? (
        <Select
          value={null}
          data={data}
          placeholder={t`Jump to an item on the graph`}
          nothingFoundMessage={t`Didn't find any results`}
          leftSection={<FixedSizeIcon name="search" />}
          w="20rem"
          searchable
          autoFocus
          data-testid="graph-selection-input"
          onChange={handleChange}
          onBlur={close}
        />
      ) : (
        <Tooltip
          label={t`Jump to an item on the graph`}
          openDelay={TOOLTIP_OPEN_DELAY}
        >
          <Button
            leftSection={<FixedSizeIcon name="search" />}
            onClick={open}
          />
        </Tooltip>
      )}
    </Card>
  );
}

function getSelectItems(nodes: NodeType[]) {
  return nodes.map((node) => ({
    value: node.id,
    label: getNodeLabel(node.data),
    icon: getNodeIcon(node.data),
  }));
}
