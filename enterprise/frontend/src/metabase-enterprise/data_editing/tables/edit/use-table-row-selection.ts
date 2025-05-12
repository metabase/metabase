import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

export function useEditingTableRowSelection(initialState: boolean = false) {
  const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);

  const [
    isRowSelectionEnabled,
    { open: setRowSelectionEnabled, close: setRowSelectionDisabled },
  ] = useDisclosure(initialState);

  return {
    selectedRowIndices,
    isRowSelectionEnabled,
    setSelectedRowIndices,
    setRowSelectionEnabled,
    setRowSelectionDisabled,
  };
}
