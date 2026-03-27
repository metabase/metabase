import { diffWords } from "diff";
import { t } from "ttag";

import { Box, Flex, Icon, Text } from "metabase/ui";
import type { DatasetQuery, FieldDiff, TableId } from "metabase-types/api";

import { QueryClauseDisplay } from "./QueryClauseDisplay";
import type { DefinitionType } from "./types";

type DiffValue = {
  before?: unknown;
  after?: unknown;
};

type RevisionDiffProps = {
  property: string;
  diff: DiffValue | undefined;
  tableId: TableId;
  definitionLabel: string;
  definitionType: DefinitionType;
};

export function RevisionDiff({
  property,
  diff,
  tableId,
  definitionLabel,
  definitionType,
}: RevisionDiffProps) {
  if (!diff) {
    return null;
  }

  const { before, after } = diff;
  const label = getPropertyLabel(property, definitionLabel);

  return (
    <Box p="md" bg="background-secondary" bd="1px solid border">
      <Flex align="center" gap="sm" mb="sm">
        <DiffIcon before={before} after={after} />
        <Text size="sm" fw={400} c="text-secondary">
          {label}
        </Text>
      </Flex>

      {property === "definition" ? (
        <DefinitionDiff
          before={before}
          after={after}
          tableId={tableId}
          definitionType={definitionType}
        />
      ) : (
        <TextDiff before={before} after={after} />
      )}
    </Box>
  );
}

function DiffIcon({ before, after }: { before: unknown; after: unknown }) {
  if (before != null && after != null) {
    return <Icon name="pencil" size={12} c="text-secondary" />;
  }
  if (before != null) {
    return <Icon name="dash" size={12} c="error" />;
  }
  return <Icon name="add" size={12} c="success" />;
}

function getPropertyLabel(property: string, definitionLabel: string): string {
  switch (property) {
    case "name":
      return t`Name`;
    case "description":
      return t`Description`;
    case "definition":
      return definitionLabel;
    default:
      return property;
  }
}

function TextDiff({ before, after }: FieldDiff) {
  const beforeStr = typeof before === "string" ? before : undefined;
  const afterStr = typeof after === "string" ? after : undefined;

  if (beforeStr != null && afterStr != null) {
    const parts = diffWords(beforeStr, afterStr);
    return (
      <Text size="sm">
        {parts.map((part, index) => (
          <Text
            key={index}
            span
            fw={part.added ? 600 : undefined}
            td={part.removed ? "line-through" : undefined}
            c={part.removed ? "text-tertiary" : undefined}
          >
            {part.value}
          </Text>
        ))}
      </Text>
    );
  }

  if (beforeStr != null) {
    return (
      <Text size="sm" td="line-through" c="text-tertiary">
        {beforeStr}
      </Text>
    );
  }

  return (
    <Text size="sm" fw={600}>
      {afterStr}
    </Text>
  );
}

type DefinitionDiffProps = {
  before: unknown;
  after: unknown;
  tableId: TableId;
  definitionType: DefinitionType;
};

function isDatasetQuery(value: unknown): value is DatasetQuery {
  return value != null && typeof value === "object";
}

function DefinitionDiff({
  before,
  after,
  tableId,
  definitionType,
}: DefinitionDiffProps) {
  const definition = after ?? before;

  if (!isDatasetQuery(definition)) {
    return null;
  }

  return (
    <QueryClauseDisplay
      definition={definition}
      tableId={tableId}
      clauseType={definitionType}
    />
  );
}
