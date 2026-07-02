import cx from "classnames";
import { Fragment } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Box,
  Center,
  FixedSizeIcon,
  Group,
  Stack,
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Database } from "metabase-types/api";

import type { SchemaViewerFlowNode } from "../../../types";

import S from "./PanelHeader.module.css";

type PanelHeaderProps = {
  node: SchemaViewerFlowNode;
  database: Database | undefined;
  onClose: () => void;
  onTitleClick?: () => void;
};

export function PanelHeader({
  node,
  database,
  onClose,
  onTitleClick,
}: PanelHeaderProps) {
  const breadcrumbs = getBreadcrumbs(node, database);
  const metadataUrl = Urls.dataStudioData({
    databaseId: node.data.db_id,
    schemaName: node.data.schema ?? "",
    tableId: node.data.table_id,
  });

  const title = (
    <Title className={CS.textWrap} order={3} lh="1.5rem">
      {node.data.name}
    </Title>
  );

  return (
    <Group className={S.root} p="lg" gap="0.75rem" wrap="nowrap">
      <Center w="2.75rem" h="2.75rem" bdrs="50%" bg="background_page-secondary">
        <FixedSizeIcon name="table" c="core-brand" size={20} />
      </Center>
      <Stack gap="xs" flex={1}>
        {onTitleClick != null ? (
          <UnstyledButton className={S.titleButton} onClick={onTitleClick}>
            {title}
          </UnstyledButton>
        ) : (
          title
        )}
        {breadcrumbs.length > 0 && (
          <Group c="text-secondary" gap="sm" wrap="nowrap">
            <Group fz="sm" gap="xs">
              {breadcrumbs.map((link, index) => (
                <Fragment key={index}>
                  {index > 0 && <Box>/</Box>}
                  <Box
                    className={cx(S.breadcrumbLink, CS.textWrap)}
                    component={Link}
                    to={link.url}
                    target="_blank"
                    lh="1rem"
                  >
                    {link.label}
                  </Box>
                </Fragment>
              ))}
            </Group>
          </Group>
        )}
      </Stack>
      <Group m="-sm" gap="xs" wrap="nowrap">
        <Tooltip label={t`View metadata`}>
          <ActionIcon
            component={ForwardRefLink}
            to={metadataUrl}
            target="_blank"
            aria-label={t`View metadata`}
          >
            <FixedSizeIcon name="external" />
          </ActionIcon>
        </Tooltip>
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}

type BreadcrumbLink = { label: string; url: string };

function getBreadcrumbs(
  node: SchemaViewerFlowNode,
  database: Database | undefined,
): BreadcrumbLink[] {
  if (database == null) {
    return [];
  }
  const links: BreadcrumbLink[] = [
    {
      label: database.name,
      url: Urls.dataStudioData({ databaseId: node.data.db_id }),
    },
  ];
  if (node.data.schema != null) {
    links.push({
      label: node.data.schema,
      url: Urls.dataStudioData({
        databaseId: node.data.db_id,
        schemaName: node.data.schema,
      }),
    });
  }
  return links;
}
