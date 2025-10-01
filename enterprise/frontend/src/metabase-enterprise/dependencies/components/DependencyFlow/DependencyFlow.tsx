import { Background, Controls, Panel, ReactFlow } from "@xyflow/react";
import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { DataPickerModal } from "metabase/common/components/Pickers/DataPicker";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Button } from "metabase/ui";
import { useGetDependencyGraphQuery } from "metabase-enterprise/api";
import {
  getQuestionIdFromVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import type { DependencyEntityType, TableId } from "metabase-types/api";

import { EntityGroupNode } from "./EntityGroupNode";
import { EntityNode } from "./EntityNode";
import { getGraphInfo } from "./utils";

const NODE_TYPES = {
  entity: EntityNode,
  "entity-group": EntityGroupNode,
};

type DependencyFlowParams = {
  id: string;
  type: DependencyEntityType;
};

type DependencyFlowProps = {
  params: DependencyFlowParams;
};

export function DependencyFlow({ params }: DependencyFlowProps) {
  const id = Urls.extractEntityId(params.id)!;
  const type = params.type;
  const { data: graph = { nodes: [], edges: [] } } = useGetDependencyGraphQuery(
    id ? { id, type } : skipToken,
  );
  const { nodes, edges } = getGraphInfo(graph);
  const [isOpened, setIsOpened] = useState(false);
  const dispatch = useDispatch();

  const handleChange = (tableId: TableId) => {
    if (isVirtualCardId(tableId)) {
      dispatch(
        push(`/dependencies/card/${getQuestionIdFromVirtualTableId(tableId)}`),
      );
    } else {
      dispatch(push(`/dependencies/table/${tableId}`));
    }
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      minZoom={0.001}
      defaultEdgeOptions={{ type: "smoothstep" }}
      fitView
    >
      <Background />
      <Controls />
      <Panel position="top-left">
        <Button
          variant="filled"
          onClick={() => setIsOpened(true)}
        >{t`Select entity`}</Button>
        {isOpened && (
          <DataPickerModal
            value={undefined}
            title={`Pick an entity`}
            onChange={handleChange}
            onClose={() => setIsOpened(false)}
          />
        )}
      </Panel>
    </ReactFlow>
  );
}
