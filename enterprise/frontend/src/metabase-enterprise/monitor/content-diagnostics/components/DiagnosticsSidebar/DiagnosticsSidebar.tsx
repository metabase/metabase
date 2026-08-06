import type { ReactNode } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Link } from "metabase/router";
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
import type { ContentDiagnosticsBaseFinding } from "metabase-types/api";

import {
  getBreadcrumbLinks,
  getEntityIcon,
  getEntityName,
  getEntityTypeLabel,
  getEntityUrl,
  getEntityViewLabel,
  getUserName,
} from "../utils";

import S from "./DiagnosticsSidebar.module.css";

const TOOLTIP_OPEN_DELAY_MS = 300;

export type SidebarExtraInfo = {
  label: string;
  children: ReactNode;
};

type DiagnosticsSidebarProps<T extends ContentDiagnosticsBaseFinding> = {
  finding: T;
  extraInfo?: SidebarExtraInfo;
  children?: ReactNode;
  onClose: () => void;
};

export function DiagnosticsSidebar<T extends ContentDiagnosticsBaseFinding>({
  finding,
  extraInfo,
  children,
  onClose,
}: DiagnosticsSidebarProps<T>) {
  const entityName = getEntityName(finding);

  return (
    <Stack
      className={S.sidebar}
      p="lg"
      gap="lg"
      bg="background_page-primary"
      role="region"
      aria-label={t`Details for ${entityName}`}
      data-testid="content-diagnostics-sidebar"
    >
      <Stack gap="lg" flex="0 0 auto">
        <SidebarHeader finding={finding} onClose={onClose} />
        <LocationSection finding={finding} />
        <InfoSection finding={finding} extraInfo={extraInfo} />
        {children}
      </Stack>
    </Stack>
  );
}

type SidebarHeaderProps = {
  finding: ContentDiagnosticsBaseFinding;
  onClose: () => void;
};

function SidebarHeader({ finding, onClose }: SidebarHeaderProps) {
  const entityUrl = getEntityUrl(finding);
  const viewLabel = getEntityViewLabel(finding);

  return (
    <Group
      gap="0.75rem"
      wrap="nowrap"
      align="start"
      justify="space-between"
      data-testid="content-diagnostics-sidebar-header"
    >
      <Group gap="sm" wrap="nowrap" align="center" miw={0}>
        <FixedSizeIcon name={getEntityIcon(finding)} />
        <Box className={S.wrap} fz="h3" fw="bold" lh="h3">
          {getEntityName(finding)}
        </Box>
      </Group>
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
  finding: ContentDiagnosticsBaseFinding;
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
            className={S.wrap}
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
  finding: ContentDiagnosticsBaseFinding;
  extraInfo?: SidebarExtraInfo;
};

function InfoSection({ finding, extraInfo }: InfoSectionProps) {
  const { description, owner, creator, view_count } = finding.details;
  const { created_at } = finding;

  return (
    <Card p={0} shadow="none" withBorder role="region" aria-label={t`Info`}>
      <InfoSectionItem label={t`Type`}>
        <Box className={S.wrap}>{getEntityTypeLabel(finding)}</Box>
      </InfoSectionItem>
      <InfoSectionItem label={t`Description`}>
        {description != null && description.length > 0 ? (
          <Box className={S.wrap}>{description}</Box>
        ) : (
          <Box c="text-secondary">{t`No description`}</Box>
        )}
      </InfoSectionItem>
      {creator != null && (
        <InfoSectionItem label={t`Created by`}>
          <Box className={S.wrap}>{getUserName(creator)}</Box>
        </InfoSectionItem>
      )}
      {owner != null && (
        <InfoSectionItem label={t`Owner`}>
          <Box className={S.wrap}>{getUserName(owner)}</Box>
        </InfoSectionItem>
      )}
      <InfoSectionItem label={t`Created at`}>
        {created_at != null ? (
          <DateTime value={created_at} unit="day" />
        ) : (
          <Box c="text-secondary">{t`Unknown`}</Box>
        )}
      </InfoSectionItem>
      {view_count != null && (
        <InfoSectionItem label={t`Views`}>
          <Box className={S.wrap}>{view_count}</Box>
        </InfoSectionItem>
      )}
      {extraInfo != null && (
        <InfoSectionItem label={extraInfo.label}>
          {extraInfo.children}
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
      <Box className={S.wrap} c="text-secondary" fz="sm" lh="h5">
        {label}
      </Box>
      <Group lh="h4" justify="space-between" wrap="nowrap">
        {children}
      </Group>
    </Stack>
  );
}
