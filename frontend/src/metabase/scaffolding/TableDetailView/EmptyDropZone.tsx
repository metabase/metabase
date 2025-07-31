import { useDroppable } from "@dnd-kit/core";
import { t } from "ttag";

import { Box, Text } from "metabase/ui/components";

interface Props {
  sectionId: string;
  message?: string;
}

export function EmptyDropZone({
  sectionId,
  message = t`Drop columns here`,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: sectionId,
  });

  return (
    <Box
      ref={setNodeRef}
      mt="sm"
      style={{
        minHeight: 40,
        border: `1px dashed ${isOver ? "var(--mb-brand)" : "var(--mb-color-border)"}`,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isOver ? "var(--mb-bg-light)" : undefined,
        transition: "all 0.2s",
      }}
    >
      <Text c="text-light">{message}</Text>
    </Box>
  );
}
