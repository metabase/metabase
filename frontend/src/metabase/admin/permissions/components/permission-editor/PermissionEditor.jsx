import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { Box } from "grid-styled";

import { PermissionsTable } from "../permissions-table";
import Subhead from "metabase/components/type/Subhead";
import Text from "metabase/components/type/Text";
import TextInput from "metabase/components/TextInput";
import Icon from "metabase/components/Icon";
import EmptyState from "metabase/components/EmptyState";

import { PermissionEditorRoot } from "./PermissionEditor.styled";

const propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  entityName: PropTypes.string.isRequired,
  permissions: PropTypes.array,
  entities: PropTypes.array,
  filterPlaceholder: PropTypes.string.isRequired,
};

export function PermissionEditor({
  title,
  description,
  entities,
  permissions,
  entityName,
  filterPlaceholder,
}) {
  const [filter, setFilter] = useState("");

  const handleFilterChange = text => setFilter(text.trim().toLowerCase());

  const filteredEntities = useMemo(() => {
    if (filter.length === 0) {
      return null;
    }

    return entities.filter(
      entity => entity.name.toLowerCase().indexOf(filter) >= 0,
    );
  }, [entities, filter]);

  return (
    <PermissionEditorRoot>
      <Box width="380px" px="3rem" pt={2}>
        <Subhead>{title}</Subhead>
        {description && <Text>{description}</Text>}

        <Box mt={2} mb={1}>
          <TextInput
            hasClearButton
            variant="admin"
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
        entityName={entityName}
        entities={filteredEntities || entities}
        permissions={permissions}
        emptyState={
          <Box mt="120px">
            <EmptyState message={t`Nothing here`} icon="all" />
          </Box>
        }
      />
    </PermissionEditorRoot>
  );
}

PermissionEditor.propTypes = propTypes;
