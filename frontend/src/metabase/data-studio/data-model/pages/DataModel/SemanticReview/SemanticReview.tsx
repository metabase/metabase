import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  NO_SUBJECT,
  type SemanticTable,
  type SemanticTypesUpdate,
  type Suggestion,
  type TableSubject,
  getFacetsLabel,
  getFieldTypeLabel,
  getTableSubjectLabel,
  isTableSubject,
  useSchemaSuggestions,
} from "metabase/metadata/semantic-types";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Group,
  Icon,
  Modal,
  NavLink,
  ScrollArea,
  Stack,
  Text,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

import { SemanticTypeSelect, SubjectSelect } from "../SemanticInputs";
import { InferredIcon } from "../TableSection/InferenceReview";

type SchemaRef = Pick<Table, "db_id" | "schema">;

type Edits = Record<string, string | null>;

const ALL_TABLES = "all";

export function SemanticReviewButton({ table }: { table: Table }) {
  const [isOpen, { open, close }] = useDisclosure(false);
  const { suggestions } = useSchemaSuggestions(table);
  const tableSuggestions = suggestions.filter(
    (suggestion) => suggestion.table.id === table.id,
  );

  if (tableSuggestions.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        leftSection={<Icon name="ai" />}
        rightSection={
          <Badge variant="light" color="brand">
            {tableSuggestions.length}
          </Badge>
        }
        onClick={open}
      >{t`Review types`}</Button>
      <SemanticReviewModal
        schema={table}
        initialTableId={table.id}
        opened={isOpen}
        onClose={close}
      />
    </>
  );
}

export function SemanticReviewSection({ schema }: { schema: SchemaRef }) {
  const [isOpen, { open, close }] = useDisclosure(false);
  const { suggestions } = useSchemaSuggestions(schema);
  const needsReviewCount = suggestions.filter(
    (suggestion) => suggestion.resolved.needsReview,
  ).length;

  return (
    <SidebarSection title={t`Semantic types`}>
      <DetailsTable>
        <DetailsRow
          label={t`Suggestions`}
          value={
            <Group justify="space-between" w="100%" wrap="nowrap">
              <Text>
                {suggestions.length === 0
                  ? t`Nothing to review`
                  : t`${suggestions.length} inferred, ${needsReviewCount} need review`}
              </Text>
              {suggestions.length > 0 && (
                <Button size="compact-sm" onClick={open}>{t`Review`}</Button>
              )}
            </Group>
          }
        />
      </DetailsTable>
      <SemanticReviewModal schema={schema} opened={isOpen} onClose={close} />
    </SidebarSection>
  );
}

type SemanticReviewModalProps = {
  schema: SchemaRef;
  initialTableId?: Table["id"];
  opened: boolean;
  onClose: () => void;
};

export function SemanticReviewModal({
  schema,
  initialTableId,
  opened,
  onClose,
}: SemanticReviewModalProps) {
  return (
    <Modal.Root opened={opened} size="72rem" onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{t`Review semantic types`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          {opened && (
            <ReviewContent
              schema={schema}
              initialTableId={initialTableId}
              onDone={onClose}
            />
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

function ReviewContent({
  schema,
  initialTableId,
  onDone,
}: {
  schema: SchemaRef;
  initialTableId?: Table["id"];
  onDone: () => void;
}) {
  const { tables, suggestions, update } = useSchemaSuggestions(schema);
  const [tableFilter, setTableFilter] = useState<string>(
    initialTableId != null ? String(initialTableId) : ALL_TABLES,
  );
  const [selection, setSelection] = useState<Set<string>>(
    () =>
      new Set(
        suggestions
          .filter((suggestion) => !suggestion.resolved.needsReview)
          .map((suggestion) => suggestion.key),
      ),
  );
  const [edits, setEdits] = useState<Edits>({});

  const visible = useMemo(
    () =>
      suggestions.filter(
        (suggestion) =>
          tableFilter === ALL_TABLES ||
          String(suggestion.table.id) === tableFilter,
      ),
    [suggestions, tableFilter],
  );
  const selected = visible.filter((suggestion) =>
    selection.has(suggestion.key),
  );
  const [needsReview, looksRight] = _.partition(
    visible,
    (suggestion) => suggestion.resolved.needsReview,
  );

  const toggle = (keys: string[], isSelected: boolean) =>
    setSelection((current) => {
      const next = new Set(current);
      keys.forEach((key) => (isSelected ? next.add(key) : next.delete(key)));
      return next;
    });

  const edit = (suggestion: Suggestion, value: string | null) => {
    setEdits((current) => ({ ...current, [suggestion.key]: value }));
    toggle([suggestion.key], true);
  };

  const accept = () => update(getAcceptUpdate(selected, edits));

  if (suggestions.length === 0) {
    return (
      <Stack gap="lg" py="md">
        <Text>{t`Every inferred type in this schema has been reviewed.`}</Text>
        <Group justify="flex-end">
          <Button variant="filled" onClick={onDone}>{t`Done`}</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Flex gap="lg" h="65vh" mih={0}>
      <ScrollArea w={240} style={{ flex: "0 0 auto" }}>
        <TableList
          tables={tables}
          suggestions={suggestions}
          value={tableFilter}
          onChange={setTableFilter}
        />
      </ScrollArea>
      <Stack flex={1} miw={0} gap="md">
        <Group justify="space-between" wrap="nowrap">
          <Checkbox
            label={t`Select all`}
            checked={visible.length > 0 && selected.length === visible.length}
            indeterminate={
              selected.length > 0 && selected.length < visible.length
            }
            onChange={(event) =>
              toggle(
                visible.map((suggestion) => suggestion.key),
                event.target.checked,
              )
            }
          />
          <Button
            variant="filled"
            disabled={selected.length === 0}
            onClick={accept}
          >
            {ngettext(
              msgid`Accept ${selected.length} suggestion`,
              `Accept ${selected.length} suggestions`,
              selected.length,
            )}
          </Button>
        </Group>
        <ScrollArea flex={1}>
          <Stack gap="lg" pr="md">
            <SuggestionGroup
              title={t`Needs review`}
              suggestions={needsReview}
              selection={selection}
              edits={edits}
              onToggle={toggle}
              onEdit={edit}
            />
            <SuggestionGroup
              title={t`Inferred`}
              suggestions={looksRight}
              selection={selection}
              edits={edits}
              onToggle={toggle}
              onEdit={edit}
            />
          </Stack>
        </ScrollArea>
      </Stack>
    </Flex>
  );
}

function getAcceptUpdate(
  suggestions: Suggestion[],
  edits: Edits,
): SemanticTypesUpdate {
  const getEdit = (suggestion: Suggestion) =>
    suggestion.key in edits ? edits[suggestion.key] : undefined;
  return {
    subjects: suggestions.flatMap((suggestion) => {
      if (suggestion.kind !== "subject") {
        return [];
      }
      const edited = getEdit(suggestion);
      const subject: TableSubject =
        edited !== undefined
          ? toSubject(edited)
          : (suggestion.resolved.subject ?? NO_SUBJECT);
      return [{ table: suggestion.table, subject }];
    }),
    fields: suggestions.flatMap((suggestion) => {
      if (suggestion.kind !== "field") {
        return [];
      }
      const edited = getEdit(suggestion);
      return [
        {
          field: suggestion.field,
          value: {
            semanticType:
              edited !== undefined ? edited : suggestion.resolved.semanticType,
            facets: suggestion.resolved.facets,
          },
        },
      ];
    }),
  };
}

function TableList({
  tables,
  suggestions,
  value,
  onChange,
}: {
  tables: SemanticTable[];
  suggestions: Suggestion[];
  value: string;
  onChange: (value: string) => void;
}) {
  const countByTableId = _.countBy(suggestions, (suggestion) =>
    String(suggestion.table.id),
  );
  const reviewedTables = _.sortBy(
    tables.filter((table) => countByTableId[String(table.id)] != null),
    "display_name",
  );

  return (
    <Stack gap={0}>
      <NavLink
        label={t`All tables`}
        leftSection={<Icon name="folder" />}
        rightSection={<Text c="text-secondary">{suggestions.length}</Text>}
        active={value === ALL_TABLES}
        onClick={() => onChange(ALL_TABLES)}
      />
      {reviewedTables.map((table) => (
        <NavLink
          key={table.id}
          label={table.display_name}
          leftSection={<Icon name="table2" />}
          rightSection={
            <Text c="text-secondary">{countByTableId[String(table.id)]}</Text>
          }
          active={value === String(table.id)}
          onClick={() => onChange(String(table.id))}
        />
      ))}
    </Stack>
  );
}

type SuggestionGroupProps = {
  title: string;
  suggestions: Suggestion[];
  selection: Set<string>;
  edits: Edits;
  onToggle: (keys: string[], isSelected: boolean) => void;
  onEdit: (suggestion: Suggestion, value: string | null) => void;
};

function SuggestionGroup({
  title,
  suggestions,
  selection,
  edits,
  onToggle,
  onEdit,
}: SuggestionGroupProps) {
  if (suggestions.length === 0) {
    return null;
  }
  return (
    <Stack gap="xs">
      <Text fw="bold" c="text-secondary" size="sm" tt="uppercase">
        {title} · {suggestions.length}
      </Text>
      <Box bd="1px solid var(--mb-color-border)" bdrs="md">
        {suggestions.map((suggestion, index) => (
          <SuggestionRow
            key={suggestion.key}
            suggestion={suggestion}
            isFirst={index === 0}
            isSelected={selection.has(suggestion.key)}
            edit={edits[suggestion.key]}
            onToggle={(isSelected) => onToggle([suggestion.key], isSelected)}
            onEdit={(value) => onEdit(suggestion, value)}
          />
        ))}
      </Box>
    </Stack>
  );
}

function SuggestionRow({
  suggestion,
  isFirst,
  isSelected,
  edit,
  onToggle,
  onEdit,
}: {
  suggestion: Suggestion;
  isFirst: boolean;
  isSelected: boolean;
  edit: string | null | undefined;
  onToggle: (isSelected: boolean) => void;
  onEdit: (value: string | null) => void;
}) {
  const { resolved, table } = suggestion;
  const signal = resolved.inference?.signal ?? null;

  return (
    <Group
      px="md"
      py="sm"
      gap="md"
      wrap="nowrap"
      bg={isSelected ? "background_surface-brand-subtle" : undefined}
      style={
        isFirst ? undefined : { borderTop: "1px solid var(--mb-color-border)" }
      }
      data-testid="semantic-suggestion"
    >
      <Checkbox
        aria-label={t`Select`}
        checked={isSelected}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <Stack gap={2} flex={1} miw={0}>
        <Text fw="bold" truncate>
          {suggestion.kind === "subject"
            ? table.display_name
            : suggestion.field.display_name}
        </Text>
        <Text size="sm" c="text-secondary" truncate>
          {getSuggestionContext(suggestion)}
        </Text>
      </Stack>
      <InferredIcon description={signal && t`Inferred: ${signal}`} />
      <Box w={260} style={{ flex: "0 0 auto" }}>
        {suggestion.kind === "subject" ? (
          <SubjectSelect
            value={
              edit !== undefined ? toSubject(edit) : suggestion.resolved.subject
            }
            onChange={onEdit}
          />
        ) : (
          <SemanticTypeSelect
            field={suggestion.field}
            value={edit !== undefined ? edit : suggestion.resolved.semanticType}
            onChange={onEdit}
          />
        )}
      </Box>
    </Group>
  );
}

function toSubject(value: string | null): TableSubject {
  return isTableSubject(value) ? value : NO_SUBJECT;
}

function getSuggestionContext(suggestion: Suggestion): string {
  if (suggestion.kind === "subject") {
    const syncSubject = suggestion.table.entity_type;
    return syncSubject && syncSubject !== NO_SUBJECT
      ? t`Table subject · sync had ${getSubjectLabelOrRaw(syncSubject)}`
      : t`Table subject`;
  }
  const { resolved, table, field } = suggestion;
  const parts = [
    t`${table.display_name} · ${field.name}`,
    resolved.replacedType != null
      ? t`sync had ${getFieldTypeLabel(resolved.replacedType)}`
      : null,
    Object.keys(resolved.facets).length > 0
      ? t`also ${getFacetsLabel(resolved.facets)}`
      : null,
  ];
  return parts.filter((part) => part != null).join(" · ");
}

function getSubjectLabelOrRaw(subject: string): string {
  return isTableSubject(subject) ? getTableSubjectLabel(subject) : subject;
}
