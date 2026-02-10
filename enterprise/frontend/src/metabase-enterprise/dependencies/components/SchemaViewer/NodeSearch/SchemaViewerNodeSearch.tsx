import { useDisclosure } from "@mantine/hooks";
import { useReactFlow } from "@xyflow/react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Card, FixedSizeIcon, Select, Tooltip } from "metabase/ui";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../constants";

import type { SchemaViewerFlowNode } from "../types";

type SchemaViewerNodeSearchProps = {
  nodes: SchemaViewerFlowNode[];
};

export function SchemaViewerNodeSearch({ nodes }: SchemaViewerNodeSearchProps) {
  const { fitView } = useReactFlow();
  const data = useMemo(() => getSelectItems(nodes), [nodes]);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [isOpened, { open, close }] = useDisclosure(false);

  const isExpanded = isOpened || selectedValue != null;

  const handleChange = (value: string | null) => {
    setSelectedValue(value);
    if (value == null) {
      fitView({ duration: 300 });
    } else {
      const selectedNode = nodes.find((node) => node.id === value);
      if (selectedNode != null) {
        fitView({ nodes: [selectedNode], duration: 300, padding: 0.5 });
      }
    }
  };

  const handleBlur = () => {
    if (selectedValue == null) {
      close();
    }
  };

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Card p={0} flex="0 0 auto" bdrs={0} bg="transparent">
      {isExpanded ? (
        <Select
          value={selectedValue}
          data={data}
          placeholder={t`Jump to table`}
          nothingFoundMessage={t`No tables found`}
          leftSection={<FixedSizeIcon name="search" />}
          w="16rem"
          searchable
          clearable
          autoFocus={isOpened && selectedValue == null}
          data-testid="schema-viewer-node-search-input"
          onChange={handleChange}
          onBlur={handleBlur}
        />
      ) : (
        <Tooltip label={t`Jump to table`} openDelay={TOOLTIP_OPEN_DELAY_MS}>
          <Button
            leftSection={<FixedSizeIcon name="search" />}
            data-testid="schema-viewer-node-search-button"
            onClick={open}
          />
        </Tooltip>
      )}
    </Card>
  );
}

function getSelectItems(nodes: SchemaViewerFlowNode[]) {
  return nodes.map((node) => ({
    value: node.id,
    label: node.data.display_name || node.data.name,
  }));
}
