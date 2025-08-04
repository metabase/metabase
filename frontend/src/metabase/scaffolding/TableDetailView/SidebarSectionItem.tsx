import { useMemo, useRef } from "react";
import { t } from "ttag";

import { Box, Flex, Group, Stack, Switch, Text } from "metabase/ui/components";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  SectionVariant,
} from "metabase-types/api";

import { FieldsPopover } from "./FieldsPopover";

const HIGHLIGHTABLE_VARIANTS = ["highlight-2", "normal"];

type Section = ObjectViewSectionSettings;

interface SidebarSectionItemProps {
  section: Section;
  sections: Section[];
  columns: DatasetColumn[];
  onUpdateSection: (sectionId: number, update: Partial<Section>) => void;
  onRemoveSection?: (sectionId: number) => void;
  openPopoverId: number | null;
  setOpenPopoverId: (id: number | null) => void;
  variant: SectionVariant;
}

export function SidebarSectionItem({
  section,
  // sections,
  columns,
  onUpdateSection,
  onRemoveSection: _onRemoveSection,
  openPopoverId,
  setOpenPopoverId,
  variant,
}: SidebarSectionItemProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const usedFieldIds = useMemo(() => {
    return new Set(section.fields.map((f) => String(f.field_id)));
  }, [section.fields]);

  return (
    <Stack gap={4}>
      <Text fw="bold" c="text-primary" size="md">
        {section.title}
      </Text>

      <Box
        key={section.id}
        px="md"
        py="sm"
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: "var(--default-border-radius)",
          backgroundColor: "var(--mb-color-bg-white)",
          cursor: "pointer",
        }}
        ref={triggerRef}
        onClick={() => {
          if (openPopoverId === section.id) {
            setOpenPopoverId(null);
          } else {
            setOpenPopoverId(section.id);
          }
        }}
      >
        <Group justify="space-between" align="flex-start">
          <Stack gap="xs" flex="1" pos="relative">
            <Text c="text-medium">
              {section.fields.length === 0
                ? t`No fields`
                : t`${section.fields.length} fields`}
            </Text>

            <FieldsPopover
              isOpen={openPopoverId === section.id}
              section={section}
              usedFieldIds={usedFieldIds}
              columns={columns}
              onUpdateSection={onUpdateSection}
              onClose={() => setOpenPopoverId(null)}
              triggerRef={triggerRef}
            />
          </Stack>
          {/* {sections.length > 1 && onRemoveSection && (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              onClick={() => onRemoveSection(section.id)}
            >
              {t`Remove`}
            </Button>
          )} */}
        </Group>
      </Box>
      {HIGHLIGHTABLE_VARIANTS.includes(variant) && (
        <Switch
          label="Highlight group"
          size="sm"
          labelPosition="left"
          checked={variant === "highlight-2"}
          styles={{
            root: {
              width: "100%",
            },
            body: { justifyContent: "space-between" },
          }}
          onChange={(event) => {
            onUpdateSection(section.id, {
              variant: (event.currentTarget.checked
                ? "highlight-2"
                : "normal") as SectionVariant,
            });
          }}
        />
      )}
    </Stack>
  );
}
