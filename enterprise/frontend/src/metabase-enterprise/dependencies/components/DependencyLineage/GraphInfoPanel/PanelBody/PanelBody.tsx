import { c, t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getUserName } from "metabase/lib/user";
import { Box, FixedSizeIcon, Group, Stack, Title } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DependencyNode } from "metabase-types/api";

import { GraphLink } from "../../GraphLink";
import { getNodeDescription } from "../../utils";

import S from "./PanelBody.module.css";
import {
  getNodeCreatedAt,
  getNodeCreatedBy,
  getNodeFields,
  getNodeFieldsLabel,
  getNodeGeneratedTableInfo,
  getNodeLastEditedAt,
  getNodeLastEditedBy,
} from "./utils";

type PanelBodyProps = {
  node: DependencyNode;
};

export function PanelBody({ node }: PanelBodyProps) {
  return (
    <Stack className={S.body} p="lg" gap="lg" lh="1rem">
      <DescriptionSection node={node} />
      <CreatorAndLastEditorSection node={node} />
      <GeneratedTableSection node={node} />
      <FieldsSection node={node} />
    </Stack>
  );
}

type SectionProps = {
  node: DependencyNode;
};

function DescriptionSection({ node }: SectionProps) {
  const description = getNodeDescription(node);

  return (
    <Box c={description ? "text-primary" : "text-secondary"} lh="h4">
      {description ?? t`No description`}
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
    <Stack gap="sm">
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

function GeneratedTableSection({ node }: SectionProps) {
  const link = getNodeGeneratedTableInfo(node);
  if (link == null) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Title order={6}>{t`Generated table`}</Title>
      <GraphLink
        label={link.label}
        icon="table"
        url={link.url}
        target="_blank"
      />
    </Stack>
  );
}

function FieldsSection({ node }: SectionProps) {
  const fields = getNodeFields(node);
  if (fields.length === 0) {
    return null;
  }

  return (
    <Stack gap="md">
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
