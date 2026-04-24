import type { ReactNode } from "react";
import { t } from "ttag";

import { EntityCreationInfo } from "metabase/common/components/EntityCreationInfo";
import { getColumnIcon } from "metabase/common/utils/columns";
import CS from "metabase/css/core/index.css";
import { Box, FixedSizeIcon, Group, Stack, Text, Title } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import * as Lib from "metabase-lib";
import type {
  DependencyEntry,
  DependencyNode,
  Field,
} from "metabase-types/api";

import {
  canNodeHaveOwner,
  getNodeCreatedAt,
  getNodeCreatedBy,
  getNodeDescription,
  getNodeFields,
  getNodeFieldsLabelWithCount,
  getNodeLastEditedAt,
  getNodeLastEditedBy,
  getNodeOwner,
} from "../../../../utils";
import { GraphBreadcrumbs } from "../../GraphBreadcrumbs";
import { GraphExternalLink } from "../../GraphExternalLink";
import { GraphLink } from "../../GraphLink";

import S from "./PanelBody.module.css";
import { getNodeTableInfo } from "./utils";

type PanelBodyProps = {
  node: DependencyNode;
  getGraphUrl: (entry: DependencyEntry) => string;
  /**
   * Optional hook to render extra content next to a field in the Fields
   * section. Used by the SchemaViewer to append a clickable FK target
   * (e.g. the related table's name) beside foreign-key fields.
   */
  renderFieldExtras?: (field: Field) => ReactNode;
};

export function PanelBody({
  node,
  getGraphUrl,
  renderFieldExtras,
}: PanelBodyProps) {
  return (
    <Stack className={S.body} p="lg" gap="lg">
      <DescriptionSection node={node} />
      <OwnerSection node={node} />
      <CreatorAndLastEditorSection node={node} />
      <TableSection node={node} getGraphUrl={getGraphUrl} />
      <FieldsSection node={node} renderFieldExtras={renderFieldExtras} />
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

function OwnerSection({ node }: SectionProps) {
  const canHaveOwner = canNodeHaveOwner(node.type);
  if (!canHaveOwner) {
    return null;
  }

  const owner = getNodeOwner(node);
  return (
    <Stack gap="xs" lh="1rem">
      <Title order={6}>{t`Owner`}</Title>
      {owner != null ? (
        <Text lh="h4">{getUserName(owner)}</Text>
      ) : (
        <Text lh="h4" c="text-secondary">{t`No owner`}</Text>
      )}
    </Stack>
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
          isCompact
        />
      </Group>
      {info.location && (
        <GraphBreadcrumbs links={info.location} ml="1rem" pl="sm" />
      )}
    </Stack>
  );
}

type FieldsSectionProps = SectionProps & {
  renderFieldExtras?: (field: Field) => ReactNode;
};

function FieldsSection({ node, renderFieldExtras }: FieldsSectionProps) {
  const fields = getNodeFields(node);
  if (fields == null) {
    return null;
  }

  return (
    <Stack gap="md" lh="1rem">
      <Title className={CS.textWrap} order={6}>
        {getNodeFieldsLabelWithCount(fields.length)}
      </Title>
      {fields.map((field, fieldIndex) => {
        const fieldTypeInfo = Lib.legacyColumnTypeInfo(field);
        const fieldIcon = getColumnIcon(fieldTypeInfo);
        const extras = renderFieldExtras?.(field);

        return (
          <Group
            className={CS.textWrap}
            key={fieldIndex}
            gap="sm"
            wrap="nowrap"
          >
            <FixedSizeIcon name={fieldIcon} c="text-secondary" />
            <Box flex="0 1 auto">{field.display_name}</Box>
            {extras != null && (
              <Box flex="1 1 auto" miw={0}>
                {extras}
              </Box>
            )}
          </Group>
        );
      })}
    </Stack>
  );
}
