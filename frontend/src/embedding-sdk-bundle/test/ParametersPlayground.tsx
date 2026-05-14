/* eslint-disable i18next/no-literal-string -- Storybook */
import { type ReactNode, useState } from "react";

import type {
  ParameterChangeSource,
  SqlParameterChangeSource,
} from "embedding-sdk-bundle/types";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import {
  Box,
  Button,
  Code,
  Divider,
  Flex,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";

export type ParametersPlaygroundProps = {
  title: string;
  description?: ReactNode;
  ready?: boolean;
  parameters: ParameterValues;
  log: string[];
  dashboard: ReactNode;
  onSetOne: (slug: string, value: string) => void;
  onClearOne: (slug: string) => void;
  onClearAll: () => void;
  onGetNow?: () => void;
  readValue?: ParameterValues | null;
  source?: string | null;
  defaultParameters?: ParameterValues | null;
  lastUsedParameters?: ParameterValues | null;
};

export const ParametersPlayground = ({
  title,
  description,
  ready,
  parameters,
  log,
  dashboard,
  onSetOne,
  onClearOne,
  onClearAll,
  onGetNow,
  readValue,
  source,
  defaultParameters,
  lastUsedParameters,
}: ParametersPlaygroundProps) => {
  const [paramSlug, setParamSlug] = useState("");
  const [paramValue, setParamValue] = useState("");

  return (
    <Flex h="100vh">
      <Stack
        w={400}
        p="md"
        gap="md"
        style={{ borderRight: "1px solid #e0e0e0", overflowY: "auto" }}
      >
        <Title order={4}>{title}</Title>
        {description && (
          <Text size="sm" c="text-secondary">
            {description}
          </Text>
        )}

        {ready !== undefined && (
          <Text size="xs" c="text-secondary">
            ready: <b>{String(ready)}</b>
          </Text>
        )}

        <Stack gap="xs">
          <TextInput
            label="Parameter slug (or id)"
            placeholder="e.g. state"
            value={paramSlug}
            onChange={(e) => setParamSlug(e.currentTarget.value)}
          />
          <TextInput
            label="Value"
            placeholder="e.g. NY"
            value={paramValue}
            onChange={(e) => setParamValue(e.currentTarget.value)}
          />
          <Group gap="xs">
            <Button
              size="xs"
              onClick={() => paramSlug && onSetOne(paramSlug, paramValue)}
            >
              Set
            </Button>
            <Button
              size="xs"
              variant="default"
              onClick={() => paramSlug && onClearOne(paramSlug)}
            >
              Clear one
            </Button>
            <Button size="xs" variant="subtle" onClick={onClearAll}>
              Clear all
            </Button>
            {onGetNow && (
              <Button size="xs" variant="light" onClick={onGetNow}>
                Get now
              </Button>
            )}
          </Group>
        </Stack>

        <Divider />

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Parent state
          </Text>
          <Text size="xs" c="text-secondary">
            Host app&apos;s view. Updated eagerly on every push; synced from
            every observed change event (including user edits).
          </Text>
          <Code block>{JSON.stringify(parameters, null, 2)}</Code>
        </Stack>

        {(source !== undefined ||
          defaultParameters !== undefined ||
          lastUsedParameters !== undefined) && (
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Last received payload
            </Text>
            {source !== undefined && (
              <Text size="xs">
                source: <b>{source ?? "(none)"}</b>
              </Text>
            )}
            {defaultParameters !== undefined && (
              <>
                <Text size="xs" fw={500}>
                  defaultParameters
                </Text>
                <Code block>
                  {defaultParameters === null
                    ? "(none)"
                    : JSON.stringify(defaultParameters, null, 2)}
                </Code>
              </>
            )}
            {lastUsedParameters !== undefined && (
              <>
                <Text size="xs" fw={500}>
                  lastUsedParameters
                </Text>
                <Code block>
                  {lastUsedParameters === null
                    ? "(none)"
                    : JSON.stringify(lastUsedParameters, null, 2)}
                </Code>
              </>
            )}
          </Stack>
        )}

        {onGetNow && (
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Last &quot;Get now&quot; snapshot
            </Text>
            <Text size="xs" c="text-secondary">
              Sync read of the controlled property — what the host last pushed.
              Should match Parent state shortly after any change.
            </Text>
            <Code block>
              {readValue === null || readValue === undefined
                ? "(not called)"
                : JSON.stringify(readValue, null, 2)}
            </Code>
          </Stack>
        )}

        <Divider />

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Event log
          </Text>
          <Box
            style={{
              maxHeight: 260,
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: 12,
            }}
          >
            {log.length === 0 ? (
              <Text size="xs" c="text-secondary">
                No events yet.
              </Text>
            ) : (
              log.map((line, i) => <div key={i}>{line}</div>)
            )}
          </Box>
        </Stack>
      </Stack>

      <Box flex={1} style={{ overflow: "hidden" }}>
        {dashboard}
      </Box>
    </Flex>
  );
};

export const formatLogEntry = (entry: string) =>
  `${new Date().toLocaleTimeString()} — ${entry}`;

type ChangePayload = {
  source: ParameterChangeSource | SqlParameterChangeSource;
  parameters: ParameterValues;
  defaultParameters: ParameterValues;
  lastUsedParameters?: ParameterValues;
};

export type UseControlledParametersPlaygroundStateOptions = {
  initialValues?: ParameterValues;
  onLocalChange?: (next: ParameterValues) => void;
};

export const useControlledParametersPlaygroundState = ({
  initialValues = {},
  onLocalChange,
}: UseControlledParametersPlaygroundStateOptions = {}) => {
  const [parameters, setParameters] = useState<ParameterValues>(initialValues);
  const [source, setSource] = useState<string | null>(null);
  const [defaultParameters, setDefaultParameters] =
    useState<ParameterValues | null>(null);
  const [lastUsedParameters, setLastUsedParameters] =
    useState<ParameterValues | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const pushLog = (entry: string) =>
    setLog((prev) => [formatLogEntry(entry), ...prev]);

  const patchAndLog = (patch: ParameterValues, description: string) => {
    setParameters((prev) => {
      const next = { ...prev, ...patch };
      onLocalChange?.(next);
      return next;
    });
    pushLog(description);
  };

  const handleParametersChange = (payload: ChangePayload) => {
    setParameters(payload.parameters);
    setSource(payload.source);
    setDefaultParameters(payload.defaultParameters);
    setLastUsedParameters(payload.lastUsedParameters ?? null);
    pushLog(
      `onParametersChange [${payload.source}] ${JSON.stringify(payload.parameters)}`,
    );
  };

  const onSetOne = (slug: string, value: string) =>
    patchAndLog({ [slug]: value }, `push ${slug} = ${JSON.stringify(value)}`);

  const onClearOne = (slug: string) =>
    patchAndLog({ [slug]: null }, `clear ${slug} (push null)`);

  const onClearAll = () => {
    const knownKeys = Object.keys(parameters);
    if (knownKeys.length === 0) {
      pushLog("clear all — nothing known yet (wait for onParametersChange)");
      return;
    }
    patchAndLog(
      Object.fromEntries(knownKeys.map((key) => [key, null])),
      `clear all (push null for ${knownKeys.join(", ")})`,
    );
  };

  return {
    parameters,
    source,
    defaultParameters,
    lastUsedParameters,
    log,
    pushLog,
    handleParametersChange,
    onSetOne,
    onClearOne,
    onClearAll,
  };
};
