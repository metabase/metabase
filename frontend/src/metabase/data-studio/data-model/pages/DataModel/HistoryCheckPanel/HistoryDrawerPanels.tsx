import { useDisclosure } from "@mantine/hooks";
import type { Ref } from "react";

import { Box } from "metabase/ui";
import type { Table, TableId } from "metabase-types/api";

import S from "../DataModel.module.css";
import { HistoryEntityPanel } from "../HistoryEntityPanel";
import {
  useHistoryCheckSelection,
  useHistoryEntitySelection,
} from "../contexts/HistoryEntitySelectionContext";

import { HistoryCheckPanel } from "./HistoryCheckPanel";
import { HistoryCheckPreview } from "./HistoryCheckPreview";

export function useHistoryDrawerPanels(tableId: TableId | undefined) {
  const { selectedEntityKey, setSelectedEntityKey } =
    useHistoryEntitySelection();
  const { selectedCheckId, selectCheck } = useHistoryCheckSelection(tableId);
  const [isPreviewOpen, { close: closePreview, toggle: togglePreview }] =
    useDisclosure(false);
  const entityKey = selectedCheckId != null ? selectedEntityKey : null;
  const isPreviewShown = selectedCheckId != null && isPreviewOpen;

  const closeCheck = () => {
    closePreview();
    selectCheck(null);
  };

  const closeInnermost = () => {
    if (isPreviewShown) {
      closePreview();
    } else if (entityKey != null) {
      setSelectedEntityKey(null);
    } else if (selectedCheckId != null) {
      closeCheck();
    } else {
      return false;
    }
    return true;
  };

  return {
    checkId: selectedCheckId,
    entityKey,
    isPreviewShown,
    closeCheck,
    closePreview,
    togglePreview,
    closeEntity: () => setSelectedEntityKey(null),
    closeInnermost,
  };
}

type HistoryDrawerPanelsProps = {
  table: Table;
  panels: ReturnType<typeof useHistoryDrawerPanels>;
  panelWidth: number;
  previewWidth: number;
  scrollToPanel: Ref<HTMLDivElement>;
  onPanelWidthChange: (width: number) => void;
};

export function HistoryDrawerPanels({
  table,
  panels,
  panelWidth,
  previewWidth,
  scrollToPanel,
  onPanelWidthChange,
}: HistoryDrawerPanelsProps) {
  const { checkId, entityKey, isPreviewShown } = panels;
  if (checkId == null) {
    return null;
  }
  return (
    <>
      <HistoryCheckPanel
        key={`${table.id}:${checkId}`}
        ref={scrollToPanel}
        table={table}
        checkId={checkId}
        defaultWidth={panelWidth}
        onWidthChange={onPanelWidthChange}
        onClose={panels.closeCheck}
        onPreviewClick={panels.togglePreview}
      />
      {entityKey != null && (
        <HistoryEntityPanel
          key={`${table.id}:${entityKey}`}
          ref={scrollToPanel}
          table={table}
          entityKey={entityKey}
          defaultWidth={panelWidth}
          onWidthChange={onPanelWidthChange}
          onClose={panels.closeEntity}
        />
      )}
      {isPreviewShown && (
        <Box
          flex="0 0 auto"
          h="100%"
          p="xl"
          w={previewWidth}
          ref={scrollToPanel}
        >
          <HistoryCheckPreview
            className={S.preview}
            table={table}
            checkId={checkId}
            onClose={panels.closePreview}
          />
        </Box>
      )}
    </>
  );
}
