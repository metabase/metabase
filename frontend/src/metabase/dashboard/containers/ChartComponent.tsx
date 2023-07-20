import { NodeViewWrapper } from "@tiptap/react";
import Visualization from "metabase/visualizations/components/Visualization/Visualization";
import Card from "metabase/components/Card";

// @ts-ignore
export default props => {
  return (
    <NodeViewWrapper className="mb-chart">
      <>
        <Card>
          <div
            className="drag-handle"
            contentEditable="false"
            draggable="true"
            data-drag-handle
            style={{
              display: "block",
              width: 8,
              height: 12,
              backgroundColor: "rgba(0,0,0,0.1)",
            }}
          />
          <span className="label">Metabase Chart</span>
          <div className="content">I am a chart</div>
          <Visualization />
        </Card>
      </>
    </NodeViewWrapper>
  );
};
