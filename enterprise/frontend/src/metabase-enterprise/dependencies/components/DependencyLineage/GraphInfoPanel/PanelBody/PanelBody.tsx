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

import { getNodeDescription, getNodeLocationInfo } from "../../utils";

import S from "./PanelBody.module.css";
import {
  getNodeCreatedAt,
  getNodeCreatedBy,
  getNodeFields,
  getNodeFieldsLabel,
  getNodeLastEditedAt,
  getNodeLastEditedBy,
} from "./utils";

type PanelBodyProps = {
  node: DependencyNode;
};

export function PanelBody({ node }: PanelBodyProps) {
  return (
    <Stack className={S.body} pl="lg" pr="lg" pb="lg" gap="lg">
      <DescriptionInfo node={node} />
      <CreatorAndEditorInfo node={node} />
      <LocationInfo node={node} />
      <FieldsInfo node={node} />
    </Stack>
  );
}

type DescriptionInfoProps = {
  node: DependencyNode;
};

function DescriptionInfo({ node }: DescriptionInfoProps) {
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

type CreatorAndEditorInfoProps = {
  node: DependencyNode;
};

function CreatorAndEditorInfo({ node }: CreatorAndEditorInfoProps) {
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

type LocationInfoProps = {
  node: DependencyNode;
};

function LocationInfo({ node }: LocationInfoProps) {
  const location = getNodeLocationInfo(node);
  if (location == null) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Title order={6}>{t`Saved in`}</Title>
      <Anchor component={Link} to={location.link} target="_blank">
        <Flex gap="sm" align="center">
          <FixedSizeIcon c="text-primary" name={location.icon} />
          <div>{location.label}</div>
        </Flex>
      </Anchor>
    </Stack>
  );
}

type FieldsInfoProps = {
  node: DependencyNode;
};

function FieldsInfo({ node }: FieldsInfoProps) {
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
