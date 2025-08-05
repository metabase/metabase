import { PointerSensor, useSensor } from "@dnd-kit/core";
import { t } from "ttag";

import { SortableList } from "metabase/common/components/Sortable/SortableList";
import { Box, Button, Group, Stack, Text } from "metabase/ui/components";
import { Icon } from "metabase/ui/components/icons";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  Table,
} from "metabase-types/api";

import { SidebarSectionItem } from "./SidebarSectionItem";
import { SortableSidebarSectionItem } from "./SortableSidebarSectionItem";

interface DetailViewSidebarProps {
  columns: DatasetColumn[];
  sections: ObjectViewSectionSettings[];
  table: Table;
  onCreateSection: (options?: { position?: "start" | "end" }) => void;
  onUpdateSection: (
    sectionId: number,
    update: Partial<ObjectViewSectionSettings>,
  ) => void;
  onUpdateSections: (sections: ObjectViewSectionSettings[]) => void;
  onRemoveSection: (sectionId: number) => void;
  onDragEnd: (event: any) => void;
  onCancel: () => void;
  onSubmit: () => void;
  openPopoverId: number | null;
  setOpenPopoverId: (id: number | null) => void;
}

export function DetailViewSidebar({
  columns,
  sections,
  // table,
  onCreateSection,
  onUpdateSection,
  onUpdateSections,
  onRemoveSection,
  onDragEnd: _onDragEnd,
  onCancel,
  onSubmit,
  openPopoverId,
  setOpenPopoverId,
}: DetailViewSidebarProps) {
  const headerSection = sections.find((s) => s.variant === "header");
  const subheaderSection = sections.find((s) => s.variant === "subheader");
  // const highlight1Section = sections.find((s) => s.variant === "highlight-1");

  const otherSections = sections.filter(
    (s) =>
      s !== headerSection &&
      s !== subheaderSection /* && s !== highlight1Section */,
  );

  // const fieldsInSections = sections.flatMap((s) => s.fields);
  // const fieldsInSectionsIds = fieldsInSections.map((f) => f.field_id);
  // const fields = table?.fields ?? [];
  // const fieldIds = fields.map(getRawTableFieldId);
  // const uncategorizedSection: ObjectViewSectionSettings = {
  //   id: -1,
  //   title: "Uncategorized",
  //   variant: "normal",
  //   fields: fieldIds
  //     .filter((id) => {
  //       return !fieldsInSectionsIds.includes(id);
  //     })
  //     .map((field_id) => ({ field_id })),
  // };

  const handleSortEnd = ({
    id,
    newIndex,
  }: {
    id: number | string;
    newIndex: number;
  }) => {
    const oldIndex = otherSections.findIndex((section) => section.id === id);
    if (oldIndex !== -1 && oldIndex !== newIndex) {
      const newSections = [...otherSections];
      const [movedSection] = newSections.splice(oldIndex, 1);
      newSections.splice(newIndex, 0, movedSection);

      // Create the new sections array with header, subheader, and reordered other sections
      const newSectionsArray = [
        ...(headerSection ? [headerSection] : []),
        ...(subheaderSection ? [subheaderSection] : []),
        ...newSections,
      ];

      onUpdateSections(newSectionsArray);
    }
  };

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  return (
    <Stack gap={0} h="100%">
      <Box
        flex="0 0 auto"
        px="xl"
        py="lg"
        style={{
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <Text fw={600} size="xl">{t`Settings`}</Text>
      </Box>

      <Box flex="1" p="xl" style={{ overflow: "auto" }}>
        <Stack gap="lg">
          {headerSection && (
            <SidebarSectionItem
              fieldsLimit={3}
              variant="header"
              section={headerSection}
              sections={sections}
              columns={columns}
              onUpdateSection={onUpdateSection}
              openPopoverId={openPopoverId}
              setOpenPopoverId={setOpenPopoverId}
            />
          )}

          {subheaderSection && (
            <SidebarSectionItem
              variant="subheader"
              fieldsLimit={4}
              section={subheaderSection}
              sections={sections}
              columns={columns}
              onUpdateSection={onUpdateSection}
              openPopoverId={openPopoverId}
              setOpenPopoverId={setOpenPopoverId}
            />
          )}

          {/* {highlight1Section && (
            <SidebarSectionItem
              variant="highlight-1"
              section={highlight1Section}
              columns={columns}
              onUpdateSection={onUpdateSection}
              openPopoverId={openPopoverId}
              setOpenPopoverId={setOpenPopoverId}
            />
          )} */}

          <Box h={1} bg="var(--border-color)" />

          <Group justify="space-between" align="center">
            <Text fw="bold" size="lg">{t`Groups`}</Text>
            <Button
              size="xs"
              variant="subtle"
              leftSection={<Icon name="add" />}
              onClick={() => onCreateSection({ position: "start" })}
            >
              {t`Add group`}
            </Button>
          </Group>

          <SortableList
            items={otherSections}
            getId={(section) => section.id}
            renderItem={({ item: section }) => (
              <SortableSidebarSectionItem
                key={section.id}
                variant={section.variant}
                section={section}
                sections={sections}
                columns={columns}
                onUpdateSection={onUpdateSection}
                onRemoveSection={onRemoveSection}
                openPopoverId={openPopoverId}
                setOpenPopoverId={setOpenPopoverId}
                showDragHandle={
                  otherSections.filter((s) => s.fields.length > 0).length > 1 &&
                  section.fields.length > 0
                }
              />
            )}
            onSortEnd={handleSortEnd}
            sensors={[pointerSensor]}
          />
          {/*
          <SidebarSectionItem
            variant={uncategorizedSection.variant}
            section={uncategorizedSection}
            columns={columns}
            // onUpdateSection={onUpdateSection}
            // onRemoveSection={onRemoveSection}
            // openPopoverId={openPopoverId}
            // setOpenPopoverId={setOpenPopoverId}
          /> */}
        </Stack>
      </Box>

      <Box
        flex="0 0 auto"
        bg="white"
        px="xl"
        py="md"
        style={{
          borderTop: "1px solid var(--border-color)",
        }}
      >
        <Group gap="md" justify="space-between">
          <Group gap="md">
            <Button size="sm" variant="subtle" onClick={onCancel}>
              {t`Cancel`}
            </Button>
          </Group>

          <Button size="sm" type="submit" variant="filled" onClick={onSubmit}>
            {t`Save`}
          </Button>
        </Group>
      </Box>
    </Stack>
  );
}
