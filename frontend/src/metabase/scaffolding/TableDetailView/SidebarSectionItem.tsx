import { useMemo, useRef } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "metabase/ui/components";
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
  columns: DatasetColumn[];
  onUpdateSection?: (sectionId: number, update: Partial<Section>) => void;
  onRemoveSection?: (sectionId: number) => void;
  openPopoverId: number | null;
  setOpenPopoverId?: (id: number | null) => void;
  variant: SectionVariant;
}

export function SidebarSectionItem({
  section,
  columns,
  onUpdateSection,
  onRemoveSection,
  openPopoverId,
  setOpenPopoverId,
  variant,
}: SidebarSectionItemProps) {
  const rootTriggerRef = useRef<HTMLDivElement>(null);
  const textTriggerRef = useRef<HTMLDivElement>(null);
  const usedFieldIds = useMemo(() => {
    return new Set(section.fields.map((f) => String(f.field_id)));
  }, [section.fields]);

  return (
    <Stack gap={4}>
      <Group justify="space-between">
        <Text fw="bold" c="text-primary" size="md">
          {section.title}
        </Text>

        {onRemoveSection && (
          <Tooltip label={t`Remove section`}>
            <Button
              c="text-dark"
              variant="subtle"
              leftSection={<Icon name="close" />}
              w={32}
              h={32}
              onClick={() => onRemoveSection(section.id)}
            />
          </Tooltip>
        )}
      </Group>

      <Box
        key={section.id}
        px="md"
        py="sm"
        bg="bg-medium"
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: "var(--default-border-radius)",
          cursor: setOpenPopoverId ? "pointer" : undefined,
        }}
        ref={rootTriggerRef}
        onClick={(event) => {
          if (!setOpenPopoverId) {
            return;
          }

          const target = event.target as HTMLElement;
          // popover is open
          if (openPopoverId === section.id) {
            // do not close popover when we click inside it e.g. add section
            if (
              rootTriggerRef.current?.contains(target) &&
              !textTriggerRef.current?.contains(target)
            ) {
              return;
            }

            setOpenPopoverId(null);
          } else {
            setOpenPopoverId(section.id);
          }
        }}
      >
        <Group justify="space-between" align="flex-start">
          <Stack gap="xs" flex="1" pos="relative">
            <Text c="text-medium" ref={textTriggerRef}>
              {section.fields.length === 0
                ? t`No fields`
                : t`${section.fields.length} fields`}
            </Text>

            {onUpdateSection && setOpenPopoverId && (
              <FieldsPopover
                isOpen={openPopoverId === section.id}
                section={section}
                usedFieldIds={usedFieldIds}
                columns={columns}
                onUpdateSection={onUpdateSection}
                onClose={() => setOpenPopoverId(null)}
                triggerRef={rootTriggerRef}
              />
            )}
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

      {HIGHLIGHTABLE_VARIANTS.includes(variant) && onUpdateSection && (
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
