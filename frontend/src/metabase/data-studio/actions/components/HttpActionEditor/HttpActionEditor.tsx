import { EditorView } from "@codemirror/view";
import { type ReactNode, useMemo } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import {
  ActionIcon,
  Button,
  Card,
  Code,
  Divider,
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
  type HttpActionRequestPart,
  type HttpActionTemplateEntry,
  getHttpActionRequestVariables,
  parseHttpActionBody,
} from "../../utils";

const WHOLE_VALUE_SYNTAX = '"{{x}}"';
const OPTIONAL_SYNTAX = "[[ … ]]";

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
    <Group
      align="flex-start"
      gap="xl"
      wrap="nowrap"
      data-testid="http-action-editor"
    >
      <Stack flex={1} miw={0} gap="2.5rem">
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
        <HttpActionSection label={t`Query parameters`}>
          <TemplateEntryList
            entries={request.queryParams}
            nameLabel={t`Query parameter name`}
            valueLabel={t`Query parameter value`}
            addLabel={t`Add query parameter`}
            emptyMessage={t`No query parameters`}
            readOnly={readOnly}
            onChange={(queryParams) => onChange({ ...request, queryParams })}
          />
        </HttpActionSection>
        <HttpActionSection label={t`Headers`}>
          <TemplateEntryList
            entries={request.headers}
            nameLabel={t`Header name`}
            valueLabel={t`Header value`}
            addLabel={t`Add header`}
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
      {!readOnly && <HttpActionVariables request={request} />}
    </Group>
  );
}

type HttpActionVariablesProps = {
  request: HttpActionRequest;
};

function HttpActionVariables({ request }: HttpActionVariablesProps) {
  const variables = useMemo(
    () => getHttpActionRequestVariables(request),
    [request],
  );

  return (
    <Card
      component="aside"
      aria-label={t`Variables`}
      w="18rem"
      flex="0 0 auto"
      p="lg"
      shadow="none"
      withBorder
    >
      <Stack gap="md">
        <Title order={5}>{t`Variables`}</Title>
        <Text c="text-secondary">
          {t`Type a {{variable}} anywhere in the URL, query parameters, headers or body. Each one becomes a field of the action's form.`}
        </Text>
        {variables.length === 0 ? (
          <Text c="text-secondary">{t`No variables yet.`}</Text>
        ) : (
          <Stack gap="sm">
            {variables.map(({ name, parts }) => (
              <Group key={name} justify="space-between" wrap="nowrap" gap="sm">
                <Code>{`{{${name}}}`}</Code>
                <Text size="sm" c="text-secondary" ta="right">
                  {parts.map(getRequestPartLabel).join(", ")}
                </Text>
              </Group>
            ))}
          </Stack>
        )}
        <Divider />
        <Stack gap="xs">
          <Text size="sm" c="text-secondary">
            {jt`${<Code key="whole">{WHOLE_VALUE_SYNTAX}</Code>} alone keeps the value's type.`}
          </Text>
          <Text size="sm" c="text-secondary">
            {jt`${<Code key="optional">{OPTIONAL_SYNTAX}</Code>} is left out when a variable in it is empty.`}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}

function getRequestPartLabel(part: HttpActionRequestPart): string {
  return match(part)
    .with("url", () => t`URL`)
    .with("queryParams", () => t`Query`)
    .with("headers", () => t`Headers`)
    .with("body", () => t`Body`)
    .exhaustive();
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
    return <Text c="text-secondary">{emptyMessage}</Text>;
  }

  return (
    <Stack gap="sm">
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
          <TextInput
            flex={1}
            value={entry.value}
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
