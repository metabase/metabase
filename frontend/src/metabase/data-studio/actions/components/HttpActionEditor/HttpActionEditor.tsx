import { EditorView } from "@codemirror/view";
import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Select,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

import {
  HTTP_ACTION_METHODS,
  type HttpActionRequest,
  type HttpActionTemplateEntry,
  parseHttpActionBody,
} from "../../utils";
import { TemplateInput, templateVariables } from "../TemplateInput";

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
      <TitleSection
        label={t`Request`}
        description={t`Where the action sends its request. It is sent from the server, not the browser.`}
        actions={requestActions}
      >
        <Group p="xl" gap="sm" wrap="nowrap">
          <Select
            w="8rem"
            data={HTTP_ACTION_METHODS}
            value={request.method}
            readOnly={readOnly}
            aria-label={t`Method`}
            onChange={handleMethodChange}
          />
          <Box flex={1} miw={0}>
            <TemplateInput
              value={request.url}
              placeholder="https://example.com/api/{{id}}"
              aria-label={t`URL`}
              readOnly={readOnly}
              onChange={(url) => onChange({ ...request, url })}
            />
          </Box>
        </Group>
      </TitleSection>
      <TitleSection label={t`Query parameters`}>
        <TemplateEntryList
          entries={request.queryParams}
          nameLabel={t`Query parameter name`}
          valueLabel={t`Query parameter value`}
          addLabel={t`Add query parameter`}
          emptyMessage={t`No query parameters`}
          readOnly={readOnly}
          onChange={(queryParams) => onChange({ ...request, queryParams })}
        />
      </TitleSection>
      <TitleSection label={t`Headers`}>
        <TemplateEntryList
          entries={request.headers}
          nameLabel={t`Header name`}
          valueLabel={t`Header value`}
          addLabel={t`Add header`}
          emptyMessage={t`No headers`}
          readOnly={readOnly}
          onChange={(headers) => onChange({ ...request, headers })}
        />
      </TitleSection>
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

type TemplateEntryListProps = {
  entries: HttpActionTemplateEntry[];
  nameLabel: string;
  valueLabel: string;
  addLabel: string;
  emptyMessage: string;
  readOnly: boolean;
  onChange: (entries: HttpActionTemplateEntry[]) => void;
};

function TemplateEntryList({
  entries,
  nameLabel,
  valueLabel,
  addLabel,
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

  if (readOnly && entries.length === 0) {
    return (
      <Text p="xl" c="text-secondary">
        {emptyMessage}
      </Text>
    );
  }

  return (
    <Stack p="xl" gap="sm">
      {entries.map((entry, index) => (
        <Group key={index} gap="sm" wrap="nowrap">
          <TextInput
            flex={1}
            value={entry.name}
            readOnly={readOnly}
            aria-label={nameLabel}
            onChange={(event) =>
              handleEntryChange(index, { ...entry, name: event.target.value })
            }
          />
          <Box flex={1} miw={0}>
            <TemplateInput
              value={entry.value}
              aria-label={valueLabel}
              readOnly={readOnly}
              onChange={(value) =>
                handleEntryChange(index, { ...entry, value })
              }
            />
          </Box>
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
      {!readOnly && (
        <Group>
          <Button
            variant="subtle"
            leftSection={<Icon name="add" />}
            onClick={() => onChange([...entries, { name: "", value: "" }])}
          >
            {addLabel}
          </Button>
        </Group>
      )}
    </Stack>
  );
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
      templateVariables(),
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
