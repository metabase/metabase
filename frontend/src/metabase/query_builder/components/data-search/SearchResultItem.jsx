import styled from "styled-components";
import React from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import Text from "metabase/components/type/Text";

import Schema from "metabase/entities/schemas";
import Database from "metabase/entities/databases";

import { color, lighten } from "metabase/lib/colors";

export function SearchResultItem({ item, onSelect }) {
  const handleClick = () => onSelect(item);

  return (
    <SearchResultItemRoot onClick={handleClick}>
      <IconWrapper>
        <Icon name="table" size={26} />
      </IconWrapper>
      <Details>
        <Title>{item.name}</Title>
        <Text fontSize={13} mb={0} mt={0}>
          <ItemLocation item={item} />
        </Text>
      </Details>
    </SearchResultItemRoot>
  );
}

SearchResultItem.propTypes = {
  item: PropTypes.object.isRequired,
  onSelect: PropTypes.func.isRequired,
};

const Title = styled.div`
  font-weight: 700;
  font-size: 14px;
  line-height: 17px;
`;

const ItemLocation = ({ item }) => {
  switch (item.model) {
    case "card":
      return item.getCollection().name;
    case "table":
      return (
        <React.Fragment>
          <Database.Name id={item.database_id} />{" "}
          {item.table_schema && (
            <Schema.ListLoader
              query={{ dbId: item.database_id }}
              loadingAndErrorWrapper={false}
            >
              {({ list }) =>
                list && list.length > 1 ? (
                  <React.Fragment>
                    <Icon
                      className="text-light"
                      name="chevronright"
                      mx="4px"
                      size={10}
                    />
                    {item.table_schema}
                  </React.Fragment>
                ) : null
              }
            </Schema.ListLoader>
          )}
        </React.Fragment>
      );
    default:
      return null;
  }
};

ItemLocation.propTypes = {
  item: PropTypes.object.isRequired,
};

const IconWrapper = styled.div`
  margin-right: 10px;
  margin-left: 10px;
  color: ${color("text-light")};
`;

const Details = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const SearchResultItemRoot = styled.div`
  cursor: pointer;
  display: flex;
  align-items: center;
  min-height: 56px;
  padding: 10px;
  color: ${color("text-dark")};
  width: 100%;

  &:hover {
    color: ${color("brand")};
    background-color: ${lighten("brand", 0.63)};

    ${IconWrapper} {
      color: ${color("brand")};
    }
  }
`;
