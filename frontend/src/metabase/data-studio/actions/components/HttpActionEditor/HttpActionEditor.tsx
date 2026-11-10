import { EditorView } from "@codemirror/view";
import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Icon,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";

import {
  HTTP_ACTION_METHODS,
  type HttpActionRequest,
  type HttpActionTemplateEntry,
  parseHttpActionBody,
} from "../../utils";

const EMPTY_ENTRY: HttpActionTemplateEntry = { name: "", value: "" };

const BODY_PLACEHOLDER = '{"id": "{{id}}"}';

type HttpActionEditorProps = {
  request: HttpActionRequest;
  requestActions?: ReactNode;
  readOnly?: boolean;
  onChange: (request: HttpActionRequest) => void;
};

export function HttpActionEditor({
  request,
  requestActions,
  readOnly = false,
  onChange,
}: HttpActionEditorProps) {
  const handleMethodChange = (value: string | null) => {
    const method = HTTP_ACTION_METHODS.find((method) => method === value);
    if (method != null) {
      onChange({ ...request, method });
    }
  };

  return (
    <Stack gap="2.5rem" data-testid="http-action-editor">
      <HttpActionSection
        label={t`Request`}
        description={t`Where the action sends its request. It is sent from the server, not the browser.`}
        actions={requestActions}
      >
        <Group gap="sm" wrap="nowrap">
          <Select
            w="8rem"
            data={HTTP_ACTION_METHODS}
            value={request.method}
            readOnly={readOnly}
            aria-label={t`Method`}
            onChange={handleMethodChange}
          />
          <TextInput
            flex={1}
            value={request.url}
            placeholder="https://example.com/api/{{id}}"
            readOnly={readOnly}
            aria-label={t`URL`}
            onChange={(event) =>
              onChange({ ...request, url: event.target.value })
            }
          />
        </Group>
      </HttpActionSection>
      <HttpActionSection
        label={t`Query parameters`}
        actions={
          !readOnly && (
            <AddEntryButton
              label={t`Add query parameter`}
              onClick={() =>
                onChange({
                  ...request,
                  queryParams: [...request.queryParams, EMPTY_ENTRY],
                })
              }
            />
          )
        }
      >
        <TemplateEntryList
          entries={request.queryParams}
          nameLabel={t`Query parameter name`}
          valueLabel={t`Query parameter value`}
          namePlaceholder="page"
          valuePlaceholder="{{page}}"
          emptyMessage={t`No query parameters`}
          readOnly={readOnly}
          onChange={(queryParams) => onChange({ ...request, queryParams })}
        />
      </HttpActionSection>
      <HttpActionSection
        label={t`Headers`}
        actions={
          !readOnly && (
            <AddEntryButton
              label={t`Add header`}
              onClick={() =>
                onChange({
                  ...request,
                  headers: [...request.headers, EMPTY_ENTRY],
                })
              }
            />
          )
        }
      >
        <TemplateEntryList
          entries={request.headers}
          nameLabel={t`Header name`}
          valueLabel={t`Header value`}
          namePlaceholder="Authorization"
          valuePlaceholder="Bearer {{secrets.token}}"
          emptyMessage={t`No headers`}
          readOnly={readOnly}
          onChange={(headers) => onChange({ ...request, headers })}
        />
      </HttpActionSection>
      <TitleSection
        label={t`Body`}
        description={t`Sent as JSON. A value that is only a {{variable}} keeps its type, so a number stays a number.`}
      >
        <HttpActionBodyEditor
          body={request.body}
          readOnly={readOnly}
          onChange={(body) => onChange({ ...request, body })}
        />
      </TitleSection>
    </Stack>
  );
}

type HttpActionSectionProps = {
  label: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

function HttpActionSection({
  label,
  description,
  actions,
  children,
}: HttpActionSectionProps) {
  return (
    <Stack>
      <Group justify="space-between" wrap="nowrap">
        <Stack flex={1} gap="sm">
          <Title order={4}>{label}</Title>
          {description != null && <Text c="text-secondary">{description}</Text>}
        </Stack>
        {actions}
      </Group>
      {children}
    </Stack>
  );
}

type AddEntryButtonProps = {
  label: string;
  onClick: () => void;
};

function AddEntryButton({ label, onClick }: AddEntryButtonProps) {
  return (
    <Button leftSection={<Icon name="add" />} onClick={onClick}>
      {label}
    </Button>
  );
}

type TemplateEntryListProps = {
  entries: HttpActionTemplateEntry[];
  nameLabel: string;
  valueLabel: string;
  namePlaceholder: string;
  valuePlaceholder: string;
  emptyMessage: string;
  readOnly: boolean;
  onChange: (entries: HttpActionTemplateEntry[]) => void;
};

function TemplateEntryList({
  entries,
  nameLabel,
  valueLabel,
  namePlaceholder,
  valuePlaceholder,
  emptyMessage,
  readOnly,
  onChange,
}: TemplateEntryListProps) {
  const handleEntryChange = (index: number, entry: HttpActionTemplateEntry) => {
    onChange(entries.map((other, i) => (i === index ? entry : other)));
  };

  const handleEntryRemove = (index: number) => {
    onChange(entries.filter((_entry, i) => i !== index));
  };

  if (entries.length === 0) {
    return (
      <Card p="xl" shadow="none" withBorder>
        <Text c="text-secondary" ta="center">
          {emptyMessage}
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="sm">
      {entries.map((entry, index) => (
        <Group key={index} gap="sm" wrap="nowrap">
          <TextInput
            flex={1}
            value={entry.name}
            placeholder={namePlaceholder}
            readOnly={readOnly}
            autoFocus={!readOnly && isEmptyEntry(entry)}
            aria-label={nameLabel}
            onChange={(event) =>
              handleEntryChange(index, { ...entry, name: event.target.value })
            }
          />
          <TextInput
            flex={1}
            value={entry.value}
            placeholder={valuePlaceholder}
            readOnly={readOnly}
            aria-label={valueLabel}
            onChange={(event) =>
              handleEntryChange(index, { ...entry, value: event.target.value })
            }
          />
          {!readOnly && (
            <ActionIcon
              variant="subtle"
              aria-label={t`Remove`}
              onClick={() => handleEntryRemove(index)}
            >
              <Icon name="close" />
            </ActionIcon>
          )}
        </Group>
      ))}
    </Stack>
  );
}

function isEmptyEntry({ name, value }: HttpActionTemplateEntry) {
  return name.length === 0 && value.length === 0;
}

type HttpActionBodyEditorProps = {
  body: string;
  readOnly: boolean;
  onChange: (body: string) => void;
};

function HttpActionBodyEditor({
  body,
  readOnly,
  onChange,
}: HttpActionBodyEditorProps) {
  const extensions = useMemo(
    () => [
      EditorView.theme({ "&": { minHeight: "8rem" } }),
      EditorView.contentAttributes.of({ "aria-label": t`Body` }),
    ],
    [],
  );
  const isValid = parseHttpActionBody(body).isValid;

  if (readOnly && body.trim().length === 0) {
    return (
      <Text p="xl" c="text-secondary">
        {t`No body`}
      </Text>
    );
  }

  return (
    <Stack gap={0}>
      <CodeEditor
        value={body}
        placeholder={BODY_PLACEHOLDER}
        language="json"
        extensions={extensions}
        aria-label={t`Body`}
        readOnly={readOnly}
        onChange={onChange}
      />
      {!readOnly && !isValid && (
        <Text px="xl" pb="md" c="feedback-negative">
          {t`The body needs to be a JSON object.`}
        </Text>
      )}
    </Stack>
  );
}
