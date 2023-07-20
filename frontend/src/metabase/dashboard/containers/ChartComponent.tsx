import { useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import Visualization from "metabase/visualizations/components/Visualization/Visualization";
import Card from "metabase/components/Card";
import { useDisclosure } from "@mantine/hooks";
import { Modal, Button, Group } from "@mantine/core";

// @ts-ignore
export default props => {
  const [opened, { open, close }] = useDisclosure(false);
  const [hasSelectedCard, setHasSelectedCard] = useState(false);
  return (
    <NodeViewWrapper className="mb-chart">
      <>
        <Card className="p4">
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
          <Modal
            opened={opened}
            onClose={() => {
              setHasSelectedCard(true);
              close();
            }}
            title="Select your card"
          >
            Maybe I can pick my card here?
          </Modal>

          {hasSelectedCard ? (
            <Visualization />
          ) : (
            <Group position="center">
              <Button onClick={open}>Pick your card</Button>
            </Group>
          )}
        </Card>
      </>
    </NodeViewWrapper>
  );
};
