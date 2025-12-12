import { c, t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getUserName } from "metabase/lib/user";
import { Box, FixedSizeIcon, Group, Stack, Title } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { getNodeDescription } from "../../../../utils";
import { GraphBreadcrumbs } from "../../GraphBreadcrumbs";
import { GraphExternalLink } from "../../GraphExternalLink";
import { GraphLink } from "../../GraphLink";

import S from "./PanelBody.module.css";
import {
  getNodeCreatedAt,
  getNodeCreatedBy,
  getNodeFields,
  getNodeFieldsLabel,
  getNodeLastEditedAt,
  getNodeLastEditedBy,
  getNodeTableInfo,
} from "./utils";

type PanelBodyProps = {
  node: DependencyNode;
  getGraphUrl: (entry: DependencyEntry) => string;
};

export function PanelBody({ node, getGraphUrl }: PanelBodyProps) {
  return (
    <Stack className={S.body} p="lg" gap="lg">
      <DescriptionSection node={node} />
      <CreatorAndLastEditorSection node={node} />
      <TableSection node={node} getGraphUrl={getGraphUrl} />
      <FieldsSection node={node} />
    </Stack>
  );
}

type SectionProps = {
  node: DependencyNode;
};

function DescriptionSection({ node }: SectionProps) {
  const description = getNodeDescription(node);
  if (description == null) {
    return null;
  }

  return (
    <Box c={description ? "text-primary" : "text-secondary"} lh="h4">
      {description.length > 0 ? description : t`No description`}
    </Box>
  );
}

function CreatorAndLastEditorSection({ node }: SectionProps) {
  const createdAt = getNodeCreatedAt(node);
  const createdBy = getNodeCreatedBy(node);
  const editedAt = getNodeLastEditedAt(node);
  const editedBy = getNodeLastEditedBy(node);
  const hasCreatedInfo = createdAt != null && createdBy != null;
  const hasEditedInfo = editedAt != null && editedBy != null;

  if (!hasCreatedInfo && !hasEditedInfo) {
    return null;
  }

  return (
    <Stack gap="sm" lh="1rem">
      <Title order={6}>{t`Creator and last editor`}</Title>
      {createdAt != null && createdBy != null && (
        <Group gap="sm" wrap="nowrap">
          <FixedSizeIcon name="ai" />
          <Box>
            {c(
              "Describes when an entity was created. {0} is a date/time and {1} is a person's name",
            ).jt`${(
              <DateTime unit="day" value={createdAt} key="date" />
            )} by ${getUserName(createdBy)}`}
          </Box>
        </Group>
      )}
      {editedAt != null && editedBy != null && (
        <Group gap="sm" wrap="nowrap">
          <FixedSizeIcon name="pencil" />
          <Box>
            {c(
              "Describes when an entity was last edited. {0} is a date/time and {1} is a person's name",
            ).jt`${(
              <DateTime unit="day" value={editedAt} key="date" />
            )} by ${getUserName(editedBy)}`}
          </Box>
        </Group>
      )}
    </Stack>
  );
}

type TableSectionProps = {
  node: DependencyNode;
  getGraphUrl: (entry: DependencyEntry) => string;
};

function TableSection({ node, getGraphUrl }: TableSectionProps) {
  const info = getNodeTableInfo(node, getGraphUrl);
  if (info == null) {
    return null;
  }

  return (
    <Stack gap="sm" lh="1rem">
      <Title order={6}>{info.label}</Title>
      <Group justify="space-between" wrap="nowrap">
        <GraphLink label={info.title.label} icon="table" url={info.title.url} />
        <GraphExternalLink
          label={info.metadata.label}
          url={info.metadata.url}
        />
      </Group>
      {info.location && (
        <GraphBreadcrumbs links={info.location} ml="1rem" pl="sm" />
      )}
    </Stack>
  );
}

function FieldsSection({ node }: SectionProps) {
  const fields = getNodeFields(node);
  if (fields.length === 0) {
    return null;
  }

  return (
    <Stack gap="md" lh="1rem">
      <Title order={6}>{getNodeFieldsLabel(fields.length)}</Title>
      {fields.map((field, fieldIndex) => {
        const fieldTypeInfo = Lib.legacyColumnTypeInfo(field);
        const fieldIcon = getColumnIcon(fieldTypeInfo);

        return (
          <Group key={fieldIndex} gap="sm" wrap="nowrap">
            <FixedSizeIcon name={fieldIcon} c="text-secondary" />
            {field.display_name}
          </Group>
        );
      })}
    </Stack>
  );
}
