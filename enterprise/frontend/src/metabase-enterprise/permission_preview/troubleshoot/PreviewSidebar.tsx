import { t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { PermissionsSidebar } from "metabase/permissions";
import { SegmentedControl, Stack, Text } from "metabase/ui";

import { StandInHint } from "../GroupPreviewInfo";
import type { Principal, PrincipalType } from "../api";
import { type PrincipalRow, usePrincipalSections } from "../principal-sections";
import { isPrincipalType } from "../urls";

type PreviewSidebarProps = {
  /** The tab's own sidebar title, kept above the switch so it doesn't move when switching to Preview. */
  title?: string;
  principalType: PrincipalType;
  principal: Principal | null;
  onPrincipalTypeChange: (type: PrincipalType) => void;
  onPrincipalChange: (principal: Principal) => void;
};

/** The Preview sidebar: User | Group, then a searchable list of them. */
export function PreviewSidebar({
  title,
  principalType,
  principal,
  onPrincipalTypeChange,
  onPrincipalChange,
}: PreviewSidebarProps) {
  const { sections, isLoading, error } = usePrincipalSections(principalType);

  const typeOptions = [
    { value: "user", label: t`User` },
    { value: "group", label: t`Group` },
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
        <Stack gap="sm" mt="md">
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
          {/* the search is core's (`FilterableTree`), with no room under it, so the hint sits just above it */}
          {principalType !== "user" && <StandInHint />}
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
    <Text size="sm" fw="normal" c="inherit" opacity={0.7} pl="sm">
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
  }
}
