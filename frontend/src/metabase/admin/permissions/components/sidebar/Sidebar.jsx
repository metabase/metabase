import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { Box } from "grid-styled";

import EmptyState from "metabase/components/EmptyState";
import Radio from "metabase/components/Radio";
import TextInput from "metabase/components/TextInput";
import Icon from "metabase/components/Icon";
import Label from "metabase/components/type/Label";
import Text from "metabase/components/type/Text";
import { Tree } from "metabase/components/tree";

import {
  SidebarRoot,
  SidebarHeader,
  SidebarContent,
  EntityGroupsDivider,
} from "./Sidebar.styled";

const propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  filterPlaceholder: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  selectedId: PropTypes.string,
  entityGroups: PropTypes.arrayOf(PropTypes.array),
  onEntityChange: PropTypes.func,
  entitySwitch: PropTypes.shape({
    value: PropTypes.string.isRequired,
    options: PropTypes.arrayOf(
      PropTypes.shape({
        name: PropTypes.string.isRequired,
        value: PropTypes.string.isRequired,
      }),
    ),
  }),
};

const searchItems = (items, filter) => {
  const matchingItems = items.filter(item =>
    item.name.toLowerCase().includes(filter),
  );

  const children = items
    .map(c => c.children)
    .filter(Boolean)
    .flat();

  const childrenMatches =
    children.length > 0 ? searchItems(children, filter) : [];

  return [...matchingItems, ...childrenMatches];
};

export function Sidebar({
  title,
  description,
  filterPlaceholder,
  entityGroups,
  entitySwitch,
  selectedId,
  onEntityChange,
  onSelect,
  onBack,
}) {
  const [filter, setFilter] = useState("");

  const handleFilterChange = text => setFilter(text);

  const filteredList = useMemo(() => {
    const trimmedFilter = filter.trim().toLowerCase();

    if (trimmedFilter.length === 0) {
      return null;
    }

    return searchItems(entityGroups.flat(), trimmedFilter);
  }, [entityGroups, filter]);

  return (
    <SidebarRoot>
      <SidebarHeader>
        <Label px={1}>
          {onBack && <Icon name="arrow_left" onClick={onBack} />}
          {title}
        </Label>
        <Text>{description}</Text>
        {entitySwitch && (
          <Box mb={2}>
            <Radio
              variant="bubble"
              colorScheme="admin"
              options={entitySwitch.options}
              value={entitySwitch.value}
              onChange={onEntityChange}
            />
          </Box>
        )}
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
      </SidebarHeader>
      <SidebarContent>
        {filteredList && (
          <Tree
            colorScheme="admin"
            data={filteredList}
            selectedId={selectedId}
            onSelect={onSelect}
            emptyState={
              <Box mt="100px">
                <EmptyState message={t`Nothing here`} icon="all" />
              </Box>
            }
          />
        )}
        {!filteredList &&
          entityGroups.map((entities, index) => {
            const isLastGroup = index === entityGroups.length - 1;
            return (
              <React.Fragment key={index}>
                <Tree
                  colorScheme="admin"
                  data={entities}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
                {!isLastGroup && <EntityGroupsDivider />}
              </React.Fragment>
            );
          })}
      </SidebarContent>
    </SidebarRoot>
  );
}

Sidebar.propTypes = propTypes;
