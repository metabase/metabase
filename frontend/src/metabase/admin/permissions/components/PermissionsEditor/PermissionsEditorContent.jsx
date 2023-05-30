import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Subhead from "metabase/components/type/Subhead";
import Text from "metabase/components/type/Text";
import EmptyState from "metabase/components/EmptyState";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { Input } from "metabase/core/components/Input";
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
    <PermissionEditorContentRoot>
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
