import { useCallback, useState } from "react";
import { t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { PermissionsSidebar } from "metabase/permissions";
import { SegmentedControl, Stack, Text, Tooltip } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { StandInHint } from "../GroupPreviewInfo";
import type { Principal, PrincipalType } from "../api";
import { type PrincipalRow, usePrincipalSections } from "../principal-sections";
import { isPrincipalType } from "../urls";

type PreviewSidebarProps = {
  /** The tab's own sidebar title, kept above the switch so it doesn't move when switching to Preview. */
  title?: string;
  principalType: PrincipalType;
  principal: Principal | null;
  /** Why Tenant can't be picked on this tab, shown on hovering it; Tenant is enabled when unset. */
  tenantDisabledReason?: string;
  onPrincipalTypeChange: (type: PrincipalType) => void;
  onPrincipalChange: (principal: Principal) => void;
};

/** The Preview sidebar: User | Group | Tenant, then a searchable list of them. */
export function PreviewSidebar({
  title,
  principalType,
  principal,
  tenantDisabledReason,
  onPrincipalTypeChange,
  onPrincipalChange,
}: PreviewSidebarProps) {
  const { sections, isLoading, error } = usePrincipalSections(principalType);
  const { typeSwitchRef, tenantSegment } = useTenantSegment();

  const typeOptions = [
    { value: "user", label: t`User` },
    { value: "group", label: t`Group` },
    ...(hasPremiumFeature("tenants")
      ? [
          {
            value: "tenant",
            label: t`Tenant`,
            disabled: tenantDisabledReason != null,
          },
        ]
      : []),
  ];

  return (
    <PermissionsSidebar
      title={title}
      isLoading={isLoading}
      error={error ? t`Couldn't load who can be previewed` : undefined}
      entityGroups={sections.map((section) => section.rows.map(toTreeItem))}
      entityGroupTitles={sections.map((section) => section.title)}
      rightSection={(item) => <RowDetail item={item} />}
      getSearchText={getSearchText}
      filterPlaceholder={getPlaceholder(principalType)}
      emptyState={{ text: t`No results found`, icon: "search" }}
      selectedId={principal?.type === principalType ? principal.id : undefined}
      headerContent={
        <Stack gap="sm" mt="md" ref={typeSwitchRef}>
          <SegmentedControl
            fullWidth
            aria-label={t`Preview as`}
            data={typeOptions}
            value={principalType}
            onChange={(value) => {
              if (isPrincipalType(value)) {
                onPrincipalTypeChange(value);
              }
            }}
          />
          {tenantDisabledReason != null && tenantSegment != null && (
            <Tooltip
              label={tenantDisabledReason}
              target={tenantSegment}
              maw="18rem"
              multiline
            />
          )}
          {/* the search is core's (`FilterableTree`), with no room under it, so the hint sits just above it */}
          {principalType !== "user" && <StandInHint type={principalType} />}
        </Stack>
      }
      onSelect={(item) => {
        if (typeof item.id === "number") {
          onPrincipalChange({ type: principalType, id: item.id });
        }
      }}
    />
  );
}

/** The Tenant segment's label, for a tooltip saying why it's disabled: the switch's labels can only be text. */
function useTenantSegment() {
  const [tenantSegment, setTenantSegment] = useState<HTMLElement | null>(null);
  // a callback ref: the switch mounts only once the sidebar has loaded
  const typeSwitchRef = useCallback((node: HTMLDivElement | null) => {
    setTenantSegment(
      node?.querySelector<HTMLElement>('input[value="tenant"] + label') ?? null,
    );
  }, []);
  return { typeSwitchRef, tenantSegment };
}

function toTreeItem(row: PrincipalRow): ITreeNodeItem<PrincipalRow> {
  return {
    id: row.id,
    name: row.name,
    secondaryText: row.secondary,
    icon: row.icon,
    data: row,
  };
}

function getRow(item: ITreeNodeItem): PrincipalRow | undefined {
  return isPrincipalRow(item.data) ? item.data : undefined;
}

function isPrincipalRow(data: unknown): data is PrincipalRow {
  return typeof data === "object" && data != null && "icon" in data;
}

function getSearchText(item: ITreeNodeItem) {
  const row = getRow(item);
  return row ? [row.name, row.secondary, row.detail].join(" ") : item.name;
}

function RowDetail({ item }: { item: ITreeNodeItem }) {
  const detail = getRow(item)?.detail;
  return detail ? (
    <Text fz="sm" fw="normal" c="inherit" opacity={0.7} pl="sm">
      {detail}
    </Text>
  ) : null;
}

function getPlaceholder(principalType: PrincipalType) {
  switch (principalType) {
    case "user":
      return t`Search for a user`;
    case "group":
      return t`Search for a group`;
    case "tenant":
      return t`Search for a tenant`;
  }
}
