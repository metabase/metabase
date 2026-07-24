import { type ReactNode, type Ref, useEffect, useRef } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
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
import type { ContentDiagnosticsFinding } from "metabase-types/api";

import {
  getBreadcrumbLinks,
  getEntityIcon,
  getEntityName,
  getEntityTypeLabel,
  getEntityUrl,
  getLastActiveLabel,
  getUserName,
} from "../utils";

import S from "./ContentDiagnosticsSidebar.module.css";

const TOOLTIP_OPEN_DELAY_MS = 300;

type ContentDiagnosticsSidebarProps = {
  finding: ContentDiagnosticsFinding;
  onClose: () => void;
};

export function ContentDiagnosticsSidebar({
  finding,
  onClose,
}: ContentDiagnosticsSidebarProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const entityName = getEntityName(finding);

  // Move focus into the panel when it opens so keyboard/screen-reader users
  // discover the details, and restore focus to the activating row on close.
  // The effect runs once per open — selecting a different row reuses this
  // instance and only swaps the `finding` prop.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();

    return () => {
      if (
        previouslyFocused instanceof HTMLElement &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus();
      }
    };
  }, []);

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
      <SidebarHeader
        finding={finding}
        closeButtonRef={closeButtonRef}
        onClose={onClose}
      />
      <LocationSection finding={finding} />
      <InfoSection finding={finding} />
    </Stack>
  );
}

type SidebarHeaderProps = {
  finding: ContentDiagnosticsFinding;
  closeButtonRef: Ref<HTMLButtonElement>;
  onClose: () => void;
};

function SidebarHeader({
  finding,
  closeButtonRef,
  onClose,
}: SidebarHeaderProps) {
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
      <Group gap="sm" wrap="nowrap" align="center" miw={0}>
        <FixedSizeIcon name={getEntityIcon(finding.entity_type)} />
        <Box className={CS.textWrap} fz="h3" fw="bold" lh="h3">
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
        <ActionIcon
          ref={closeButtonRef}
          aria-label={t`Close`}
          onClick={onClose}
        >
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
  const { description, owner, creator, view_count } = finding.details;
  const { created_at, last_active_at } = finding;

  return (
    <Card p={0} shadow="none" withBorder role="region" aria-label={t`Info`}>
      <InfoSectionItem label={t`Type`}>
        <Box className={CS.textWrap}>
          {getEntityTypeLabel(finding.entity_type)}
        </Box>
      </InfoSectionItem>
      <InfoSectionItem label={t`Description`}>
        {description != null && description.length > 0 ? (
          <Box className={CS.textWrap}>{description}</Box>
        ) : (
          <Box c="text-secondary">{t`No description`}</Box>
        )}
      </InfoSectionItem>
      {creator != null && (
        <InfoSectionItem label={t`Created by`}>
          <Box className={CS.textWrap}>{getUserName(creator)}</Box>
        </InfoSectionItem>
      )}
      {owner != null && (
        <InfoSectionItem label={t`Owner`}>
          <Box className={CS.textWrap}>{getUserName(owner)}</Box>
        </InfoSectionItem>
      )}
      <InfoSectionItem label={t`Created at`}>
        {created_at != null ? (
          <DateTime value={created_at} unit="day" />
        ) : (
          <Box c="text-secondary">{t`Unknown`}</Box>
        )}
      </InfoSectionItem>
      <InfoSectionItem label={getLastActiveLabel(finding.entity_type)}>
        {last_active_at != null ? (
          <DateTime value={last_active_at} unit="day" />
        ) : (
          <Box c="text-secondary">{t`Never`}</Box>
        )}
      </InfoSectionItem>
      {view_count != null && (
        <InfoSectionItem label={t`Views`}>
          <Box className={CS.textWrap}>{view_count}</Box>
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
