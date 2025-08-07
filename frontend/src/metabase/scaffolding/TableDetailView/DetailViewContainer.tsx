import type { DragEndEvent } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { t } from "ttag";

import { Box, Group, Stack, Text } from "metabase/ui/components";
import type { ForeignKeyReferences } from "metabase/visualizations/components/ObjectDetail/types";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValues,
  Table,
} from "metabase-types/api";

import { DetailViewHeader } from "./DetailViewHeader";
import { DetailViewSidebar } from "./DetailViewSidebar";
import { Relationships } from "./ObjectRelations";

interface DetailViewContainerProps {
  children: ReactNode;
  rowId: number | string;
  rowName: ReactNode;
  table: Table;
  isEdit: boolean;
  row: RowValues;
  columns: DatasetColumn[];
  sections: ObjectViewSectionSettings[];
  tableForeignKeys: ForeignKey[];
  tableForeignKeyReferences: ForeignKeyReferences;
  openPopoverId: number | null;
  setOpenPopoverId: (id: number | null) => void;
  hasRelationships: boolean;
  onEditClick: () => void;
  onPreviousItemClick?: () => void;
  onNextItemClick?: () => void;
  onCloseClick: () => void;
  onSaveClick: () => void;
  onCreateSection: (options?: { position?: "start" | "end" }) => void;
  onUpdateSection: (
    id: number,
    update: Partial<ObjectViewSectionSettings>,
  ) => void;
  onUpdateSections: (sections: ObjectViewSectionSettings[]) => void;
  onRemoveSection: (id: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onFollowForeignKey: (fk: ForeignKey) => void;
  hoveredSectionId: number | null;
  setHoveredSectionId: (id: number | null) => void;
}

export function DetailViewContainer({
  children,
  rowId,
  rowName,
  table,
  isEdit,
  row,
  columns,
  sections,
  tableForeignKeys,
  tableForeignKeyReferences,
  openPopoverId,
  setOpenPopoverId,
  hasRelationships,
  onEditClick,
  onPreviousItemClick,
  onNextItemClick,
  onCloseClick,
  onSaveClick,
  onCreateSection,
  onUpdateSection,
  onUpdateSections,
  onRemoveSection,
  onDragEnd,
  onCancel,
  onSubmit,
  onFollowForeignKey,
  hoveredSectionId,
  setHoveredSectionId,
}: DetailViewContainerProps) {
  return (
    <Stack
      bg="bg-white"
      // bg="#F9FBFC"
      gap={0}
      flex="1"
      miw={0}
      h="100%"
      style={{
        overflow: "auto",
        // borderTop: "1px solid var(--mb-color-border)",
      }}
    >
      <DetailViewHeader
        columns={columns}
        sections={sections}
        row={row}
        rowId={rowId}
        rowName={rowName}
        table={table}
        isEdit={isEdit}
        canOpenPreviousItem={onPreviousItemClick != null}
        canOpenNextItem={onNextItemClick != null}
        onEditClick={onEditClick}
        onPreviousItemClick={onPreviousItemClick || (() => {})}
        onNextItemClick={onNextItemClick || (() => {})}
        onCloseClick={onCloseClick}
        onSaveClick={onSaveClick}
      />

      <Group
        align="flex-start"
        gap={0}
        mih={0}
        wrap="nowrap"
        h="100%"
        style={{
          borderTop: "1px solid var(--border-color)",
        }}
      >
        <Stack
          align="center"
          bg="#F9FBFC"
          h="100%"
          flex="1"
          p="xl"
          style={{ overflow: "auto" }}
        >
          <Box maw={800} w="100%">
            {children}
          </Box>
        </Stack>

        {(hasRelationships || isEdit) && (
          <Box
            bg="white"
            flex="0 0 auto"
            mih={0}
            miw={400}
            h="100%"
            // p="lg"
            style={{
              borderLeft: `1px solid var(--mb-color-border)`,
              // overflowY: "auto",
            }}
          >
            {isEdit && (
              <DetailViewSidebar
                columns={columns}
                sections={sections}
                table={table}
                onCreateSection={onCreateSection}
                onUpdateSection={onUpdateSection}
                onUpdateSections={onUpdateSections}
                onRemoveSection={onRemoveSection}
                onDragEnd={onDragEnd}
                onCancel={onCancel}
                onSubmit={onSubmit}
                openPopoverId={openPopoverId}
                setOpenPopoverId={setOpenPopoverId}
                hoveredSectionId={hoveredSectionId}
                setHoveredSectionId={setHoveredSectionId}
              />
            )}

            {!isEdit && (
              <Stack
                pos="relative"
                bg={isEdit ? "bg-medium" : "bg-white"}
                gap={0}
                h="100%"
              >
                <Box
                  flex="0 0 auto"
                  px="xl"
                  py="lg"
                  style={{
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  <Text fw="bold" size="xl">{t`Relationships`}</Text>
                </Box>

                <Box
                  flex="1"
                  px="xl"
                  pb="xl"
                  pt={16}
                  style={{ overflow: "auto" }}
                >
                  <Relationships
                    objectName={rowName ? String(rowName) : String(rowId)}
                    tableForeignKeys={tableForeignKeys}
                    tableForeignKeyReferences={tableForeignKeyReferences}
                    foreignKeyClicked={onFollowForeignKey}
                    disableClicks={isEdit}
                    relationshipsDirection={"vertical"}
                  />
                </Box>
              </Stack>
            )}
          </Box>
        )}
      </Group>
    </Stack>
  );
}
