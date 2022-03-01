import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { PermissionsTable } from "../PermissionsTable";
import Subhead from "metabase/components/type/Subhead";
import Text from "metabase/components/type/Text";
import TextInput from "metabase/components/TextInput";
import Icon from "metabase/components/Icon";
import EmptyState from "metabase/components/EmptyState";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";

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
        <TextInput
          hasClearButton
          colorScheme="admin"
          placeholder={filterPlaceholder}
          onChange={setFilter}
          value={filter}
          padding="sm"
          borderRadius="md"
          icon={<Icon name="search" size={16} />}
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
              <EmptyState message={t`Nothing here`} icon="all" />
            </EditorEmptyStateContainer>
          }
        />
      </PermissionTableWrapper>
    </PermissionEditorContentRoot>
  );
}

PermissionsEditorContent.propTypes = permissionEditorContentPropTypes;
