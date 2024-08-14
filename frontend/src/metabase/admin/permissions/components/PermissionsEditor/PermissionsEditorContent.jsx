import PropTypes from "prop-types";
import { useState, useMemo } from "react";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import Subhead from "metabase/components/type/Subhead";
import Text from "metabase/components/type/Text";
import Input from "metabase/core/components/Input";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";

import { PermissionsTable } from "../PermissionsTable";

import { PermissionsEditorBreadcrumbs } from "./PermissionsEditorBreadcrumbs";
import {
  EditorEmptyStateContainer,
  EditorFilterContainer,
  PermissionEditorContentRoot,
  PermissionTableWrapper,
} from "./PermissionsEditorContent.styled";

export const permissionEditorContentPropTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  columns: PropTypes.array,
  entities: PropTypes.array,
  filterPlaceholder: PropTypes.string.isRequired,
  onChange: PropTypes.func,
  onSelect: PropTypes.func,
  onAction: PropTypes.func,
  onBreadcrumbsItemSelect: PropTypes.func,
  breadcrumbs: PropTypes.array,
  postHeaderContent: PropTypes.func,
  preHeaderContent: PropTypes.func,
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
}) {
  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebouncedValue(filter, SEARCH_DEBOUNCE_DURATION);

  const filteredEntities = useMemo(() => {
    const trimmedFilter = debouncedFilter.trim().toLowerCase();

    if (trimmedFilter.length === 0) {
      return null;
    }

    return entities.filter(entity =>
      entity.name.toLowerCase().includes(trimmedFilter),
    );
  }, [entities, debouncedFilter]);

  const handleFilterChange = e => setFilter(e.target.value);

  return (
    <PermissionEditorContentRoot data-testid="permissions-editor">
      <PreHeaderContent />
      <Subhead>
        {title}{" "}
        {breadcrumbs && (
          <PermissionsEditorBreadcrumbs
            items={breadcrumbs}
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

PermissionsEditorContent.propTypes = permissionEditorContentPropTypes;
