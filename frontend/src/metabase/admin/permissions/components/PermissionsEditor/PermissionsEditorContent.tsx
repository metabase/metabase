import { useMemo, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { Input } from "metabase/common/components/Input";
import { Subhead } from "metabase/common/components/type/Subhead";
import { Text } from "metabase/common/components/type/Text";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";

import type {
  PermissionEditorBreadcrumb,
  PermissionEditorType,
} from "../../types";
import {
  PermissionsTable,
  type PermissionsTableProps,
} from "../PermissionsTable";

import { PermissionsEditorBreadcrumbs } from "./PermissionsEditorBreadcrumbs";
import {
  EditorEmptyStateContainer,
  EditorFilterContainer,
  PermissionEditorContentRoot,
  PermissionTableWrapper,
} from "./PermissionsEditorContent.styled";

export type PermissionsEditorContentProps = PermissionEditorType &
  Pick<PermissionsTableProps, "onChange" | "onSelect" | "onAction"> & {
    onBreadcrumbsItemSelect?: (item: PermissionEditorBreadcrumb) => void;
    description?: string;
    postHeaderContent?: React.FC;
    preHeaderContent?: React.FC;
  };

export function PermissionsEditorContent({
  title,
  description,
  entities,
  columns,
  filterPlaceholder,
  breadcrumbs,
  onBreadcrumbsItemSelect,
  onChange,
  onSelect,
  onAction,
  postHeaderContent: PostHeaderContent = () => null,
  preHeaderContent: PreHeaderContent = () => null,
}: PermissionsEditorContentProps) {
  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebouncedValue(filter, SEARCH_DEBOUNCE_DURATION);

  const filteredEntities = useMemo(() => {
    const trimmedFilter = debouncedFilter.trim().toLowerCase();

    if (trimmedFilter.length === 0) {
      return null;
    }

    return entities.filter((entity) =>
      entity.name.toLowerCase().includes(trimmedFilter),
    );
  }, [entities, debouncedFilter]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilter(e.target.value);

  return (
    <PermissionEditorContentRoot data-testid="permissions-editor">
      <PreHeaderContent />
      <Subhead data-testid="permissions-editor-breadcrumbs">
        {title}{" "}
        {breadcrumbs && onBreadcrumbsItemSelect && (
          <PermissionsEditorBreadcrumbs
            breadcrumbs={breadcrumbs}
            onBreadcrumbsItemSelect={onBreadcrumbsItemSelect}
          />
        )}
      </Subhead>

      {description && <Text>{description}</Text>}

      <PostHeaderContent />

      <EditorFilterContainer>
        <Input
          colorScheme="filter"
          placeholder={filterPlaceholder}
          onChange={handleFilterChange}
          onResetClick={() => setFilter("")}
          value={filter}
          leftIcon="search"
        />
      </EditorFilterContainer>

      <PermissionTableWrapper>
        <PermissionsTable
          entities={filteredEntities || entities}
          columns={columns}
          onSelect={onSelect}
          onChange={onChange}
          onAction={onAction}
          emptyState={
            <EditorEmptyStateContainer>
              <EmptyState message={t`Nothing here`} icon="folder" />
            </EditorEmptyStateContainer>
          }
        />
      </PermissionTableWrapper>
    </PermissionEditorContentRoot>
  );
}
