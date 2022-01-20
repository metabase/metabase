import React, { useState, useMemo, memo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { Box, Flex } from "grid-styled";

import EmptyState from "metabase/components/EmptyState";
import Radio from "metabase/components/Radio";
import TextInput from "metabase/components/TextInput";
import Icon from "metabase/components/Icon";
import Label from "metabase/components/type/Label";
import Text from "metabase/components/type/Text";
import { Tree } from "metabase/components/tree";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";

import { searchItems } from "./utils";
import {
  SidebarHeader,
  SidebarContent,
  EntityGroupsDivider,
  BackButton,
  BackIcon,
} from "./PermissionsSidebar.styled";

export const permissionSidebarContentPropTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  filterPlaceholder: PropTypes.string.isRequired,
  onSelect: PropTypes.func,
  onBack: PropTypes.func,
  selectedId: PropTypes.oneOfType([
    PropTypes.string.isRequired,
    PropTypes.number.isRequired,
  ]),
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

export const PermissionsSidebarContent = memo(
  function PermissionsSidebarContent({
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
    const debouncedFilter = useDebouncedValue(filter, SEARCH_DEBOUNCE_DURATION);

    const filteredList = useMemo(() => {
      const trimmedFilter = debouncedFilter.trim().toLowerCase();

      if (trimmedFilter.length === 0) {
        return null;
      }

      return searchItems(entityGroups.flat(), trimmedFilter);
    }, [entityGroups, debouncedFilter]);

    return (
      <>
        <SidebarHeader>
          {onBack ? (
            <BackButton onClick={onBack}>
              <BackIcon />
              {title}
            </BackButton>
          ) : (
            <Flex alignItems="center">
              {title && <Label px={1}>{title}</Label>}
            </Flex>
          )}
          <Text color="text-dark" px={1}>
            {description}
          </Text>
          {entitySwitch && (
            <Box mb={2}>
              <Radio
                variant="bubble"
                colorScheme="accent7"
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
            onChange={setFilter}
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
      </>
    );
  },
);

PermissionsSidebarContent.propTypes = permissionSidebarContentPropTypes;
