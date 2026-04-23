import cx from "classnames";
import { memo, useMemo } from "react";
import { t } from "ttag";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Anchor,
  Box,
  Card,
  Center,
  FixedSizeIcon,
  Group,
  Stack,
  Tooltip,
} from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import * as Urls from "metabase/utils/urls";
import { FieldsSection } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/FieldsSection";
import { InfoSection } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/InfoSection";
import { LocationSection } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/LocationSection";
import { SidebarResizableBox } from "metabase-enterprise/dependencies/components/DependencyDiagnostics/DiagnosticsSidebar/SidebarResizableBox";
import type {
  ConcreteTableId,
  Table,
  TableDependencyNode,
  WorkspaceRemapping,
} from "metabase-types/api";

import HeaderS from "./WorkspaceRemappingSidebarHeader.module.css";
import S from "./WorkspaceRemappingSidebar.module.css";

type WorkspaceRemappingSidebarProps = {
  remapping: WorkspaceRemapping;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export const WorkspaceRemappingSidebar = memo(function WorkspaceRemappingSidebar({
  remapping,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: WorkspaceRemappingSidebarProps) {
  const tableId =
    typeof remapping.from_table_id === "number"
      ? remapping.from_table_id
      : null;

  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery(tableId != null ? { id: tableId } : skipToken);

  const node = useMemo(
    () => (table != null ? toTableDependencyNode(table) : null),
    [table],
  );

  return (
    <SidebarResizableBox
      containerWidth={containerWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      <Stack
        className={S.sidebar}
        p="lg"
        gap="xl"
        bg="background-primary"
        data-testid="workspace-remapping-sidebar"
      >
        <Stack gap="lg">
          <SidebarHeader
            title={table?.display_name ?? remapping.from_table_name}
            link={
              table != null
                ? {
                    label: t`View metadata`,
                    url: Urls.dataStudioData({
                      databaseId: table.db_id,
                      schemaName: table.schema,
                      tableId: table.id as ConcreteTableId,
                    }),
                  }
                : undefined
            }
            dependencyGraphUrl={
              table != null
                ? Urls.dependencyGraph({
                    entry: {
                      id: table.id as ConcreteTableId,
                      type: "table",
                    },
                  })
                : undefined
            }
            onClose={onClose}
          />
          {tableId != null &&
            !isLoading &&
            error == null &&
            node != null && (
              <>
                <LocationSection node={node} />
                <InfoSection node={node} />
              </>
            )}
          <MappedToSection remapping={remapping} />
        </Stack>
        {tableId != null && (isLoading || error != null) ? (
          <Center>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          node != null && <FieldsSection node={node} />
        )}
      </Stack>
    </SidebarResizableBox>
  );
});

type SidebarHeaderLink = {
  label: string;
  url: string;
};

type SidebarHeaderProps = {
  title: string;
  link?: SidebarHeaderLink;
  dependencyGraphUrl?: string;
  onClose: () => void;
};

function SidebarHeader({
  title,
  link,
  dependencyGraphUrl,
  onClose,
}: SidebarHeaderProps) {
  return (
    <Group
      gap="0.75rem"
      wrap="nowrap"
      align="start"
      justify="space-between"
      data-testid="workspace-remapping-sidebar-header"
    >
      {link != null ? (
        <Anchor
          className={cx(CS.textWrap, HeaderS.link)}
          component={ForwardRefLink}
          fz="h3"
          fw="bold"
          lh="h3"
          to={link.url}
          target="_blank"
        >
          {title}
        </Anchor>
      ) : (
        <Box className={CS.textWrap} fz="h3" fw="bold" lh="h3">
          {title}
        </Box>
      )}
      <Group gap="xs" wrap="nowrap">
        {link != null && (
          <Tooltip label={link.label} openDelay={TOOLTIP_OPEN_DELAY}>
            <ActionIcon
              component={ForwardRefLink}
              to={link.url}
              target="_blank"
              aria-label={link.label}
            >
              <FixedSizeIcon name="external" />
            </ActionIcon>
          </Tooltip>
        )}
        {dependencyGraphUrl != null && (
          <Tooltip
            label={t`View in dependency graph`}
            openDelay={TOOLTIP_OPEN_DELAY}
          >
            <ActionIcon
              component={ForwardRefLink}
              to={dependencyGraphUrl}
              target="_blank"
              aria-label={t`View in dependency graph`}
            >
              <FixedSizeIcon name="dependencies" />
            </ActionIcon>
          </Tooltip>
        )}
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}

type MappedToSectionProps = {
  remapping: WorkspaceRemapping;
};

function MappedToSection({ remapping }: MappedToSectionProps) {
  return (
    <Card p={0} shadow="none" withBorder role="region" aria-label={t`Mapped to`}>
      <Stack className={S.section} p="md" gap="xs">
        <Box c="text-secondary" fz="sm" lh="h5">
          {t`Mapped to`}
        </Box>
        <Group gap="sm" wrap="nowrap" lh="h4">
          <FixedSizeIcon name="table2" />
          <Box className={CS.textWrap}>
            {remapping.to_schema}
            <Box component="span" c="text-primary" mx={2}>
              /
            </Box>
            {remapping.to_table_name}
          </Box>
        </Group>
      </Stack>
    </Card>
  );
}

function toTableDependencyNode(table: Table): TableDependencyNode {
  return {
    id: table.id as ConcreteTableId,
    type: "table",
    data: {
      name: table.name,
      display_name: table.display_name,
      description: table.description,
      db_id: table.db_id,
      schema: table.schema,
      db: table.db,
      fields: table.fields,
      transform: table.transform,
      owner: table.owner,
    },
  };
}
