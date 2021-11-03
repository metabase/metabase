import styled from "styled-components";
import React from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import Text from "metabase/components/type/Text";

import { color, lighten } from "metabase/lib/colors";

import { ItemLocation } from "./ItemLocation";

function getSearchResultItemIcon(item) {
  return item.model === "dataset" ? "dataset" : "table2";
}

export function SearchResultItem({ item, onSelect }) {
  const handleClick = () => onSelect(item);

  return (
    <SearchResultItemRoot onClick={handleClick}>
      <IconWrapper>
        <Icon name={getSearchResultItemIcon(item)} size={22} />
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

const SearchResultItemRoot = styled.li`
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
