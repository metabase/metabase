import { t } from "ttag";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { type EntityView, PermissionsSidebar } from "metabase/permissions";
import { Box, SegmentedControl, Text } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import type { Principal, PrincipalType } from "../api";
import {
  type PrincipalRow,
  type PrincipalSection,
  usePrincipalSections,
} from "../principal-sections";

import { isPrincipalType } from "./urls";

type PreviewSidebarProps = {
  /** The tab's own sidebar title, so the layout matches the tab's other views. */
  title?: string;
  principalType: PrincipalType;
  principal: Principal | null;
  /** The tab's other views, for the switch back out of Preview; none on a page of its own. */
  entityViews?: EntityView[];
  onEntityChange?: (view: EntityView) => void;
  onPrincipalTypeChange: (type: PrincipalType) => void;
  onPrincipalChange: (principal: Principal) => void;
  /** Where the people come from; the "View app as…" tab lists them through the admin's own endpoint. */
  useSections?: (type: PrincipalType) => {
    sections: PrincipalSection[];
    isLoading: boolean;
    error: unknown;
  };
};

/** The Preview sidebar: User | Group | Tenant, then a searchable list of them. */
export function PreviewSidebar({
  title,
  principalType,
  principal,
  entityViews,
  onEntityChange,
  onPrincipalTypeChange,
  onPrincipalChange,
  useSections = usePrincipalSections,
}: PreviewSidebarProps) {
  const { sections, isLoading, error } = useSections(principalType);

  const typeOptions = [
    { value: "user", label: t`User` },
    { value: "group", label: t`Group` },
    ...(hasPremiumFeature("tenants")
      ? [{ value: "tenant", label: t`Tenant` }]
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
      selectedId={principal?.type === principalType ? principal.id : undefined}
      entityViewFocus={onEntityChange ? "preview" : undefined}
      entityViews={entityViews}
      onEntityChange={onEntityChange}
      headerContent={
        <Box mt="md">
          <SegmentedControl
            fullWidth
            aria-label={t`Preview as a`}
            data={typeOptions}
            value={principalType}
            onChange={(value) => {
              if (isPrincipalType(value)) {
                onPrincipalTypeChange(value);
              }
            }}
          />
        </Box>
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
    secondaryText: row.email,
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
  return row ? [row.name, row.email, row.detail].join(" ") : item.name;
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
