import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Anchor,
  Box,
  Breadcrumbs,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Tooltip,
} from "metabase/ui";
import { SidebarResizableBox } from "metabase-enterprise/monitor/components";
import type { ContentDiagnosticsFinding } from "metabase-types/api";

import {
  getBreadcrumbLinks,
  getEntityName,
  getEntityTypeLabel,
  getEntityUrl,
  getUserName,
} from "../utils";

import S from "./ContentDiagnosticsSidebar.module.css";

const TOOLTIP_OPEN_DELAY_MS = 300;

type ContentDiagnosticsSidebarProps = {
  finding: ContentDiagnosticsFinding;
  containerWidth: number;
  onResizeStart: () => void;
  onResizeStop: () => void;
  onClose: () => void;
};

export function ContentDiagnosticsSidebar({
  finding,
  containerWidth,
  onResizeStart,
  onResizeStop,
  onClose,
}: ContentDiagnosticsSidebarProps) {
  return (
    <SidebarResizableBox
      containerWidth={containerWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      <Stack
        className={S.sidebar}
        p="lg"
        gap="lg"
        bg="background_page-primary"
        data-testid="content-diagnostics-sidebar"
      >
        <SidebarHeader finding={finding} onClose={onClose} />
        <LocationSection finding={finding} />
        <InfoSection finding={finding} />
      </Stack>
    </SidebarResizableBox>
  );
}

type SidebarHeaderProps = {
  finding: ContentDiagnosticsFinding;
  onClose: () => void;
};

function SidebarHeader({ finding, onClose }: SidebarHeaderProps) {
  const entityUrl = getEntityUrl(finding);
  const entityType = getEntityTypeLabel(finding.entity_type).toLowerCase();
  const viewLabel = t`View ${entityType}`;

  return (
    <Group
      gap="0.75rem"
      wrap="nowrap"
      align="start"
      justify="space-between"
      data-testid="content-diagnostics-sidebar-header"
    >
      <Anchor
        className={cx(CS.textWrap, S.link)}
        component={ForwardRefLink}
        fz="h3"
        fw="bold"
        lh="h3"
        to={entityUrl}
        target="_blank"
      >
        {getEntityName(finding)}
      </Anchor>
      <Group gap="xs" wrap="nowrap">
        <Tooltip label={viewLabel} openDelay={TOOLTIP_OPEN_DELAY_MS}>
          <ActionIcon
            component={ForwardRefLink}
            to={entityUrl}
            target="_blank"
            aria-label={viewLabel}
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

type LocationSectionProps = {
  finding: ContentDiagnosticsFinding;
};

function LocationSection({ finding }: LocationSectionProps) {
  const links = getBreadcrumbLinks(finding);

  return (
    <div role="region" aria-label={t`Location`}>
      <Breadcrumbs
        lh="1rem"
        separator={<FixedSizeIcon name="chevronright" size={12} />}
      >
        {links.map((link) => (
          <Anchor
            key={link.id}
            component={Link}
            className={CS.textWrap}
            lh="1rem"
            to={link.url}
            target="_blank"
          >
            <Group gap="sm" wrap="nowrap">
              {link.icon != null && <FixedSizeIcon name={link.icon} />}
              {link.label}
            </Group>
          </Anchor>
        ))}
      </Breadcrumbs>
    </div>
  );
}

type InfoSectionProps = {
  finding: ContentDiagnosticsFinding;
};

function InfoSection({ finding }: InfoSectionProps) {
  const { description, owner, creator } = finding.details;

  return (
    <Card p={0} shadow="none" withBorder role="region" aria-label={t`Info`}>
      <InfoSectionItem label={t`Description`}>
        {description != null && description.length > 0 ? (
          <Box className={CS.textWrap}>{description}</Box>
        ) : (
          <Box c="text-secondary">{t`No description`}</Box>
        )}
      </InfoSectionItem>
      <InfoSectionItem label={t`Owner`}>
        {owner != null ? (
          <Box className={CS.textWrap}>{getUserName(owner)}</Box>
        ) : (
          <Box c="text-secondary">{t`No owner`}</Box>
        )}
      </InfoSectionItem>
      {creator != null && (
        <InfoSectionItem label={t`Created by`}>
          <Box className={CS.textWrap}>{getUserName(creator)}</Box>
        </InfoSectionItem>
      )}
    </Card>
  );
}

type InfoSectionItemProps = {
  label: string;
  children?: ReactNode;
};

function InfoSectionItem({ label, children }: InfoSectionItemProps) {
  return (
    <Stack className={S.section} p="md" gap="xs">
      <Box className={CS.textWrap} c="text-secondary" fz="sm" lh="h5">
        {label}
      </Box>
      <Group lh="h4" justify="space-between" wrap="nowrap">
        {children}
      </Group>
    </Stack>
  );
}
