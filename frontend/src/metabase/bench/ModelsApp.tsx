import { Box } from "metabase/ui";
import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { BenchPanel } from "./components/Panel/Panel";
import { ModelsEntitiesList } from "./components/ModelsEntitiesList/ModelsEntitiesList";
import { ModelsDetails } from "./components/ModelsDetails/ModelsDetails";
import type { Card } from "metabase-types/api";

interface ModelsAppProps {
  params?: {
    modelId?: string;
  };
}

export function ModelsApp({ params }: ModelsAppProps) {
  const [selectedModel, setSelectedModel] = useState<Card | undefined>();

  const handleModelClick = (model: Card) => {
    setSelectedModel(model);
  };

  return (
    <Box h="100vh" style={{ overflow: "hidden" }}>
      <PanelGroup direction="horizontal">
        {/* Left Panel - Models List */}
        <Panel defaultSize={20} minSize={15} maxSize={35}>
          <BenchPanel title="Models" height="100%">
            <ModelsEntitiesList
              selectedModelId={selectedModel?.id}
              onModelClick={handleModelClick}
            />
          </BenchPanel>
        </Panel>

        <PanelResizeHandle
          style={{
            width: "4px",
            cursor: "col-resize",
            borderRadius: "2px",
            margin: "0 2px",
          }}
        />

        {/* Main Panel - Model Details and Results */}
        <Panel defaultSize={80} minSize={50}>
          <Box h="100%" p="md">
            <Box
              h="100%"
              p="lg"
              style={{
                backgroundColor: "var(--mb-color-bg-white)",
                border: "1px solid var(--mb-color-border)",
                borderRadius: "8px",
              }}
            >
              <ModelsDetails model={selectedModel} />
            </Box>
          </Box>
        </Panel>
      </PanelGroup>
    </Box>
  );
}
