import { useMemo } from "react";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Popover,
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
  sections: Section[];
  columns: DatasetColumn[];
  fieldsLimit?: number;
  onUpdateSection?: (sectionId: number, update: Partial<Section>) => void;
  onRemoveSection?: (sectionId: number) => void;
  openPopoverId: number | null;
  setOpenPopoverId?: (id: number | null) => void;
  variant: SectionVariant;
  showDragHandle?: boolean;
  dragHandleRef?: React.RefObject<HTMLDivElement>;
  dragHandleListeners?: React.HTMLAttributes<HTMLDivElement>;
}

export function SidebarSectionItem({
  section,
  sections,
  columns,
  fieldsLimit,
  onUpdateSection,
  onRemoveSection,
  openPopoverId,
  setOpenPopoverId,
  variant,
  showDragHandle,
  dragHandleRef,
  dragHandleListeners,
}: SidebarSectionItemProps) {
  const usedFieldIds = useMemo(() => {
    return new Set(section.fields.map((f) => String(f.field_id)));
  }, [section.fields]);
  const usedFieldIdsAnywhere = useMemo(() => {
    return new Set(
      sections.flatMap((s) => s.fields).map((f) => String(f.field_id)),
    );
  }, [sections]);

  return (
    <Stack gap="xs" maw="330px">
      <Group align="center" wrap="nowrap" gap="xs">
        {showDragHandle && (
          <Flex
            ref={dragHandleRef}
            {...dragHandleListeners}
            style={{ cursor: "grab" }}
          >
            <Icon name="grabber" size={16} />
          </Flex>
        )}
        {(!onUpdateSection || !onRemoveSection) && (
          <Text fw="bold" c="text-primary" size="md">
            {section.title}
          </Text>
        )}

        {onRemoveSection && onUpdateSection && (
          <Box px="xs" style={{ flexGrow: 1, overflow: "hidden" }}>
            <EditableText
              initialValue={section.title}
              maxLength={240}
              onChange={(title) => onUpdateSection(section.id, { title })}
              style={{
                position: "relative",
                left: -4,
                fontWeight: "bold",
                width: "fit-content",
                // fontSize: "1.25rem",
              }}
            />
          </Box>
        )}

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

      {onUpdateSection && setOpenPopoverId && (
        <Popover
          opened={openPopoverId === section.id}
          onChange={
            openPopoverId === section.id
              ? () => setOpenPopoverId(null)
              : undefined
          }
          position="bottom-start"
          offset={4}
        >
          <Popover.Target>
            <Box
              key={section.id}
              px="md"
              py="sm"
              bg="bg-medium"
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: "var(--default-border-radius)",
                cursor: "pointer",
              }}
              onClick={() => {
                if (!setOpenPopoverId) {
                  return;
                }

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
                </Stack>
              </Group>
            </Box>
          </Popover.Target>
          <Popover.Dropdown>
            <FieldsPopover
              section={section}
              usedFieldIds={usedFieldIds}
              usedFieldIdsAnywhere={usedFieldIdsAnywhere}
              columns={columns}
              onUpdateSection={onUpdateSection}
              onClose={() => setOpenPopoverId(null)}
              fieldsLimit={fieldsLimit}
            />
          </Popover.Dropdown>
        </Popover>
      )}

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
