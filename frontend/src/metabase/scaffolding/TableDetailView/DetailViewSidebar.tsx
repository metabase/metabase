import { t } from "ttag";

import { Box, Button, Group, Stack, Text } from "metabase/ui/components";
import { Icon } from "metabase/ui/components/icons";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
} from "metabase-types/api";

import { SidebarSectionItem } from "./SidebarSectionItem";

interface DetailViewSidebarProps {
  columns: DatasetColumn[];
  sections: ObjectViewSectionSettings[];
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
  onCreateSection,
  onUpdateSection,
  onUpdateSections: _onUpdateSections,
  onRemoveSection,
  onDragEnd: _onDragEnd,
  onCancel,
  onSubmit,
  openPopoverId,
  setOpenPopoverId,
}: DetailViewSidebarProps) {
  const headerSection = sections.find((s) => s.variant === "header");
  const subheaderSection = sections.find((s) => s.variant === "subheader");
  const highlight1Section = sections.find((s) => s.variant === "highlight-1");

  const otherSections = sections.filter(
    (s) =>
      s !== headerSection && s !== subheaderSection && s !== highlight1Section,
  );

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
              variant="header"
              section={headerSection}
              sections={sections}
              columns={columns}
              onUpdateSection={onUpdateSection}
              onRemoveSection={onRemoveSection}
              openPopoverId={openPopoverId}
              setOpenPopoverId={setOpenPopoverId}
            />
          )}

          {subheaderSection && (
            <SidebarSectionItem
              variant="subheader"
              section={subheaderSection}
              sections={sections}
              columns={columns}
              onUpdateSection={onUpdateSection}
              onRemoveSection={onRemoveSection}
              openPopoverId={openPopoverId}
              setOpenPopoverId={setOpenPopoverId}
            />
          )}

          {highlight1Section && (
            <SidebarSectionItem
              variant="highlight-1"
              section={highlight1Section}
              sections={sections}
              columns={columns}
              onUpdateSection={onUpdateSection}
              onRemoveSection={onRemoveSection}
              openPopoverId={openPopoverId}
              setOpenPopoverId={setOpenPopoverId}
            />
          )}

          <Box h={1} bg="var(--border-color)" />

          <Group justify="space-between" align="center">
            <Text fw="bold" size="lg">{t`Sections`}</Text>
            <Button
              size="xs"
              variant="subtle"
              leftSection={<Icon name="add" />}
              onClick={() => onCreateSection({ position: "end" })}
            >
              {t`Add section`}
            </Button>
          </Group>

          {otherSections.map((section) => (
            <SidebarSectionItem
              key={section.id}
              variant={section.variant}
              section={section}
              sections={sections}
              columns={columns}
              onUpdateSection={onUpdateSection}
              onRemoveSection={onRemoveSection}
              openPopoverId={openPopoverId}
              setOpenPopoverId={setOpenPopoverId}
            />
          ))}
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
