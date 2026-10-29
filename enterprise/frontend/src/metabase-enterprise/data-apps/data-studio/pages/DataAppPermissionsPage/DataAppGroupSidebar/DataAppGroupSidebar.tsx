import cx from "classnames";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { SidebarResizableBox } from "metabase/common/components/SidebarResizableBox";
import { getGroupNameLocalized } from "metabase/common/utils/groups";
import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Title,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { useGetDataAppGroupPermissionWarningsQuery } from "metabase-enterprise/api";
import type { DataApp, DataAppGroup } from "metabase-types/api";

import S from "./DataAppGroupSidebar.module.css";
import { MissingTablesSection } from "./MissingTablesSection";

type DataAppGroupSidebarProps = {
  app: DataApp;
  group: DataAppGroup;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export function DataAppGroupSidebar({
  app,
  group,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: DataAppGroupSidebarProps) {
  const { data: warnings } = useGetDataAppGroupPermissionWarningsQuery(
    app.name,
  );
  const warning = warnings?.find(({ group_id }) => group_id === group.id);
  const groupUrl = Urls.adminGroup(group.id);

  return (
    <SidebarResizableBox
      containerWidth={containerWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      <Stack
        className={S.sidebar}
        p="xl"
        gap="xxl"
        bg="background_page-primary"
        data-testid="data-app-group-sidebar"
      >
        <Stack gap="xl">
          <Group
            gap="0.75rem"
            wrap="nowrap"
            align="start"
            justify="space-between"
          >
            <Title className={cx(CS.textWrap)} order={3}>
              {getGroupNameLocalized(group)}
            </Title>
            <Group gap="xxs" wrap="nowrap">
              <Tooltip label={t`View group`}>
                <ActionIcon
                  variant="subtle"
                  component={ForwardRefLink}
                  to={groupUrl}
                  target="_blank"
                  aria-label={t`View group`}
                >
                  <FixedSizeIcon name="external" />
                </ActionIcon>
              </Tooltip>
              <ActionIcon
                variant="subtle"
                aria-label={t`Close`}
                onClick={onClose}
              >
                <FixedSizeIcon name="close" />
              </ActionIcon>
            </Group>
          </Group>
          <Card
            p={0}
            shadow="none"
            withBorder
            role="region"
            aria-label={t`Info`}
          >
            <Stack p="lg" gap="xxs">
              <Box c="text-secondary" fz="sm" lh="h5">
                {t`Members`}
              </Box>
              <Box lh="h4">{group.member_count}</Box>
            </Stack>
          </Card>
        </Stack>
        {warning != null && warning.missing_tables.length > 0 && (
          <MissingTablesSection tables={warning.missing_tables} />
        )}
      </Stack>
    </SidebarResizableBox>
  );
}
