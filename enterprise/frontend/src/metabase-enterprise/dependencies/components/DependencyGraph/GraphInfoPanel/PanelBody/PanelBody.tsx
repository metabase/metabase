import { t } from "ttag";

import { EntityCreationInfo } from "metabase/common/components/EntityCreationInfo";
import { getColumnIcon } from "metabase/common/utils/columns";
import CS from "metabase/css/core/index.css";
import { Box, FixedSizeIcon, Group, Stack, Title } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import {
  getNodeCreatedAt,
  getNodeCreatedBy,
  getNodeDescription,
  getNodeFields,
  getNodeFieldsLabel,
  getNodeLastEditedAt,
  getNodeLastEditedBy,
} from "../../../../utils";
import { GraphBreadcrumbs } from "../../GraphBreadcrumbs";
import { GraphExternalLink } from "../../GraphExternalLink";
import { GraphLink } from "../../GraphLink";

import S from "./PanelBody.module.css";
import { getNodeTableInfo } from "./utils";

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
    <Box
      className={CS.textWrap}
      c={description ? "text-primary" : "text-secondary"}
      lh="h4"
    >
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
    <EntityCreationInfo
      createdAt={createdAt}
      creator={createdBy}
      lastEditedAt={editedAt}
      lastEditor={editedBy}
    />
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
      <Title className={CS.textWrap} order={6}>
        {getNodeFieldsLabel(fields.length)}
      </Title>
      {fields.map((field, fieldIndex) => {
        const fieldTypeInfo = Lib.legacyColumnTypeInfo(field);
        const fieldIcon = getColumnIcon(fieldTypeInfo);

        return (
          <Group
            className={CS.textWrap}
            key={fieldIndex}
            gap="sm"
            wrap="nowrap"
          >
            <FixedSizeIcon name={fieldIcon} c="text-secondary" />
            {field.display_name}
          </Group>
        );
      })}
    </Stack>
  );
}
