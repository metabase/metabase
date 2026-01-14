import { useEffect, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  Box,
  Button,
  Flex,
  HoverCard,
  Icon,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import {
  addEntry,
  buildEntries,
  buildMapping,
  removeEntry,
  replaceEntryKey,
  replaceEntryValue,
} from "metabase-enterprise/sandboxes/utils";
import type {
  StructuredUserAttribute,
  StructuredUserAttributes,
  UserAttributeMap,
  UserAttributeSource,
} from "metabase-types/api";

export type MappingEditorEntry = {
  key: string;
  value: string;
  keyOpts?: {
    disabled?: boolean;
    source?: UserAttributeSource;
  };
  valueOpts?: {
    disabled?: boolean;
    revert?: StructuredUserAttribute;
  };
};

const entryError = (entries: MappingEditorEntry[], key: string) => {
  if (entries.filter((e) => e.key === key).length > 1) {
    return t`Attribute keys can't have the same name`;
  }
  if (
    entries.some(
      (e) => !e.keyOpts?.disabled && e.key === key && e.key.startsWith("@"),
    )
  ) {
    return t`Keys starting with "@" are reserved for system use`;
  }
  return false;
};

const hasError = (entries: MappingEditorEntry[]) => {
  return entries.some(({ key }) => entryError(entries, key));
};

export const buildStructuredEntries = (
  attributes?: StructuredUserAttributes,
): MappingEditorEntry[] => {
  return Object.entries(attributes ?? {})
    .map(([key, { value, source, frozen, original }]) => ({
      key,
      value,
      keyOpts: {
        disabled: source !== "user" || !!original,
        source: original?.source || source,
      },
      valueOpts: {
        disabled: frozen,
        revert:
          original ||
          (source === "jwt" || source === "tenant"
            ? { value, source, frozen: false }
            : undefined),
      },
    }))
    .sort((a, b) =>
      // sort so that disabled keys and values are first
      String(a.keyOpts.disabled) + String(a.valueOpts.disabled) <
      String(b.keyOpts.disabled) + String(b.valueOpts.disabled)
        ? 1
        : -1,
    );
};

export interface MappingEditorProps {
  simpleAttributes?: UserAttributeMap;
  structuredAttributes?: StructuredUserAttributes;
  onChange: (val: UserAttributeMap) => void;
  onError?: (val: boolean) => void;
}

export const LoginAttributeMappingEditor = ({
  simpleAttributes = {},
  structuredAttributes,
  onChange,
  onError,
}: MappingEditorProps) => {
  const [entries, setEntries] = useState<MappingEditorEntry[]>(
    structuredAttributes ? [] : buildEntries(simpleAttributes),
  );

  useEffect(() => {
    // structuredAttributes can change if a different tenant is selected
    if (structuredAttributes) {
      setEntries((previousEntries) => [
        ...buildStructuredEntries(structuredAttributes),
        // keep any user-defined entries
        ...previousEntries.filter((entry) => !entry.keyOpts?.disabled),
      ]);
    }
  }, [structuredAttributes]);

  const handleChange = (newEntries: MappingEditorEntry[]) => {
    setEntries(newEntries);
    if (onError && hasError(newEntries)) {
      onError(hasError(newEntries));
    } else {
      onChange(buildMapping(newEntries));
    }
  };

  return (
    <Box data-testid="mapping-editor">
      {entries.map(({ key, value, keyOpts, valueOpts }, index) => {
        const canDeleteThis = !keyOpts?.disabled && !valueOpts?.disabled;
        const canRevert =
          !canDeleteThis &&
          valueOpts?.revert &&
          valueOpts?.revert.value !== value;

        return (
          <Flex key={index} gap="sm" mb="sm" justify="space-between">
            <Flex w="50%" align="center">
              <KeyInput
                value={key}
                onChange={(e) => {
                  handleChange(replaceEntryKey(entries, index, e.target.value));
                }}
                keyOpts={keyOpts}
                error={entryError(entries, key)}
              />
            </Flex>
            <Flex gap="sm" w="50%">
              <ValueInput
                canDelete={canDeleteThis}
                canRevert={!!canRevert}
                value={value}
                valueOpts={valueOpts}
                onRevert={() =>
                  handleChange(
                    replaceEntryValue(
                      entries,
                      index,
                      valueOpts?.revert?.value || "",
                    ),
                  )
                }
                onChange={(e) => {
                  handleChange(
                    replaceEntryValue(entries, index, e.target.value),
                  );
                }}
                onDelete={() => handleChange(removeEntry(entries, index))}
              />
            </Flex>
          </Flex>
        );
      })}
      <Button
        variant="light"
        size="xs"
        leftSection={<Icon name="add" />}
        onClick={() => handleChange(addEntry(entries))}
        mt="md"
        disabled={_.some(
          entries,
          (entry) => entry.value === "" || entry.key === "",
        )}
      >
        {t`Add an attribute`}
      </Button>
    </Box>
  );
};

const KeyInput = ({
  keyOpts,
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  keyOpts: MappingEditorEntry["keyOpts"];
  error?: string | boolean;
}) => {
  if (keyOpts?.disabled) {
    return (
      <>
        <Text px="sm">{value}</Text>
        <InfoCard source={keyOpts.source} />
      </>
    );
  }

  return (
    <TextInput
      placeholder={t`Key`}
      value={value || ""}
      w="100%"
      onChange={onChange}
      error={error}
    />
  );
};

const ValueInput = ({
  value,
  onChange,
  onRevert,
  onDelete,
  canDelete,
  canRevert,
  valueOpts,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  canRevert: boolean;
  canDelete: boolean;
  onRevert: () => void;
  onDelete: () => void;
  valueOpts: MappingEditorEntry["valueOpts"];
}) => {
  return (
    <>
      <TextInput
        placeholder={t`Value`}
        value={value || ""}
        onChange={onChange}
        w="100%"
        {...valueOpts}
      />
      {canDelete && (
        <Button
          leftSection={<Icon name="close" />}
          onClick={onDelete}
          data-testid="remove-mapping"
        />
      )}
      {canRevert && (
        <Tooltip
          label={t`Revert to "${valueOpts?.revert?.value}" value from ${valueOpts?.revert?.source}`}
        >
          <Button
            leftSection={<Icon name="refresh" />}
            onClick={onRevert}
            data-testid="revert-mapping"
          />
        </Tooltip>
      )}
    </>
  );
};

const infoText = (source?: "system" | "jwt" | "user" | "tenant"): string => {
  switch (source) {
    case "system":
      return t`This attribute is system defined`;
    case "jwt":
      return t`This attribute was set by the login token, but you can override its value`;
    case "tenant":
      return t`This attribute is inherited from the tenant, but you can override its value`;
    default:
      return "";
  }
};

const InfoCard = ({
  source,
}: {
  source?: "tenant" | "system" | "user" | "jwt";
}) =>
  !["tenant", "system", "jwt"].includes(source ?? "") ? null : (
    <HoverCard>
      <HoverCard.Target>
        <Icon name="info" c="text-tertiary" />
      </HoverCard.Target>
      <HoverCard.Dropdown maw="20rem">
        <Text p="sm" maw="20rem">
          {infoText(source)}
        </Text>
      </HoverCard.Dropdown>
    </HoverCard>
  );
