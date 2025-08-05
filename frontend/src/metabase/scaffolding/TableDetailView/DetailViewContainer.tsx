import type { DragEndEvent } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { t } from "ttag";

import { Box, Group, Stack, Text } from "metabase/ui/components";
import type { ForeignKeyReferences } from "metabase/visualizations/components/ObjectDetail/types";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  Table,
} from "metabase-types/api";

import { DetailViewHeader } from "./DetailViewHeader";
import { DetailViewSidebar } from "./DetailViewSidebar";
import { Relationships } from "./ObjectRelations";

interface DetailViewContainerProps {
  children: ReactNode;
  rowId: number;
  rowName: ReactNode;
  table: Table;
  isEdit: boolean;
  rows: any[];
  currentRowIndex: number;
  columns: DatasetColumn[];
  sections: ObjectViewSectionSettings[];
  tableForeignKeys: ForeignKey[];
  tableForeignKeyReferences: ForeignKeyReferences;
  openPopoverId: number | null;
  setOpenPopoverId: (id: number | null) => void;
  hasRelationships: boolean;
  onEditClick: () => void;
  onPreviousItemClick: () => void;
  onNextItemClick: () => void;
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
}

export function DetailViewContainer({
  children,
  rowId,
  rowName,
  table,
  isEdit,
  rows,
  currentRowIndex,
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
}: DetailViewContainerProps) {
  return (
    <Stack
      bg="bg-white"
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
        row={rows[currentRowIndex]}
        rowId={rowId}
        rowName={rowName}
        table={table}
        isEdit={isEdit}
        canOpenPreviousItem={rows.length > 1 && currentRowIndex > 0}
        canOpenNextItem={rows.length > 1 && currentRowIndex < rows.length - 1}
        onEditClick={onEditClick}
        onPreviousItemClick={onPreviousItemClick}
        onNextItemClick={onNextItemClick}
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
          bg="bg-white"
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
