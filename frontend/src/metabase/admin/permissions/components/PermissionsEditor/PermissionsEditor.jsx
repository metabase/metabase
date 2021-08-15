import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { Box } from "grid-styled";

import { PermissionsTable } from "../PermissionsTable";
import Subhead from "metabase/components/type/Subhead";
import Text from "metabase/components/type/Text";
import TextInput from "metabase/components/TextInput";
import Icon from "metabase/components/Icon";
import EmptyState from "metabase/components/EmptyState";

import { PermissionsEditorRoot } from "./PermissionsEditor.styled";
import { PermissionsEditorBreadcrumbs } from "./PermissionsEditorBreadcrumbs";

export const permissionEditorPropTypes = {
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

export function PermissionsEditor({
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

  const handleFilterChange = text => setFilter(text);

  const filteredEntities = useMemo(() => {
    const trimmedFilter = filter.trim().toLowerCase();

    if (trimmedFilter.length === 0) {
      return null;
    }

    return entities.filter(entity =>
      entity.name.toLowerCase().includes(trimmedFilter),
    );
  }, [entities, filter]);

  return (
    <PermissionsEditorRoot>
      <Box px="3rem" pt={2}>
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

        <Box mt={2} mb={1} width="280px">
          <TextInput
            hasClearButton
            colorScheme="admin"
            placeholder={filterPlaceholder}
            onChange={handleFilterChange}
            value={filter}
            padding="sm"
            borderRadius="md"
            icon={<Icon name="search" size={16} />}
          />
        </Box>
      </Box>

      <PermissionsTable
        horizontalPadding="lg"
        entities={filteredEntities || entities}
        columns={columns}
        onSelect={onSelect}
        onChange={onChange}
        onAction={onAction}
        emptyState={
          <Box mt="120px">
            <EmptyState message={t`Nothing here`} icon="all" />
          </Box>
        }
      />
    </PermissionsEditorRoot>
  );
}

PermissionsEditor.propTypes = permissionEditorPropTypes;
