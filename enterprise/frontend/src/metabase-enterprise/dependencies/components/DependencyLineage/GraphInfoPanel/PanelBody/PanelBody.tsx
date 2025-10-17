import type { HTMLAttributeAnchorTarget } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import { getColumnIcon } from "metabase/common/utils/columns";
import { getUserName } from "metabase/lib/user";
import {
  Anchor,
  Box,
  FixedSizeIcon,
  Flex,
  Group,
  Stack,
  Title,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DependencyNode } from "metabase-types/api";

import type { NodeLinkInfo } from "../../types";
import { getNodeDescription, getNodeLocationInfo } from "../../utils";

import S from "./PanelBody.module.css";
import {
  getNodeCreatedAt,
  getNodeCreatedBy,
  getNodeDatabaseInfo,
  getNodeFields,
  getNodeFieldsLabel,
  getNodeGeneratedTableInfo,
  getNodeLastEditedAt,
  getNodeLastEditedBy,
  getNodeSchemaInfo,
} from "./utils";

type PanelBodyProps = {
  node: DependencyNode;
};

export function PanelBody({ node }: PanelBodyProps) {
  return (
    <Stack className={S.body} pl="lg" pr="lg" pb="lg" gap="lg">
      <DescriptionInfo node={node} />
      <CreatorAndLastEditorInfo node={node} />
      <CollectionOrDashboardInfo node={node} />
      <DatabaseInfo node={node} />
      <SchemaInfo node={node} />
      <GeneratedTableInfo node={node} />
      <FieldsInfo node={node} />
    </Stack>
  );
}

type PanelBodyPartProps = {
  node: DependencyNode;
};

function DescriptionInfo({ node }: PanelBodyPartProps) {
  const description = getNodeDescription(node);

  return (
    <Stack gap="sm">
      <Title order={6}>{t`Description`}</Title>
      <Box c={description ? "text-primary" : "text-secondary"}>
        {description ?? t`No description`}
      </Box>
    </Stack>
  );
}

function CreatorAndLastEditorInfo({ node }: PanelBodyPartProps) {
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

function CollectionOrDashboardInfo({ node }: PanelBodyPartProps) {
  const link = getNodeLocationInfo(node);
  if (link == null) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Title order={6}>{t`Saved in`}</Title>
      <LinkWithIcon link={link} target="_blank" />
    </Stack>
  );
}

function DatabaseInfo({ node }: PanelBodyPartProps) {
  const link = getNodeDatabaseInfo(node);
  if (link == null) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Title order={6}>{t`Database`}</Title>
      <LinkWithIcon link={link} target="_blank" />
    </Stack>
  );
}

function SchemaInfo({ node }: PanelBodyPartProps) {
  const link = getNodeSchemaInfo(node);
  if (link == null) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Title order={6}>{t`Schema`}</Title>
      <LinkWithIcon link={link} target="_blank" />
    </Stack>
  );
}

function GeneratedTableInfo({ node }: PanelBodyPartProps) {
  const link = getNodeGeneratedTableInfo(node);
  if (link == null) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Title order={6}>{t`Generated table`}</Title>
      <LinkWithIcon link={link} />
    </Stack>
  );
}

function FieldsInfo({ node }: PanelBodyPartProps) {
  const fields = getNodeFields(node);
  if (fields.length === 0) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Title order={6}>{getNodeFieldsLabel(fields.length)}</Title>
      {fields.map((field, fieldIndex) => {
        const fieldTypeInfo = Lib.legacyColumnTypeInfo(field);
        const fieldIcon = getColumnIcon(fieldTypeInfo);

        return (
          <Group key={fieldIndex} gap="sm" wrap="nowrap">
            <FixedSizeIcon name={fieldIcon} />
            {field.display_name}
          </Group>
        );
      })}
    </Stack>
  );
}

type LinkWithIconProps = {
  link: NodeLinkInfo;
  target?: HTMLAttributeAnchorTarget;
};

function LinkWithIcon({ link, target }: LinkWithIconProps) {
  return (
    <Anchor component={Link} to={link.url} target={target}>
      <Flex gap="sm" align="center">
        <FixedSizeIcon c="text-primary" name={link.icon} />
        <div>{link.label}</div>
      </Flex>
    </Anchor>
  );
}
