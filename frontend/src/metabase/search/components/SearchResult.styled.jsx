import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Link from "metabase/core/components/Link";
import Text from "metabase/components/type/Text";
import LoadingSpinner from "metabase/components/LoadingSpinner";

function getColorForIconWrapper(props) {
  if (!props.active) {
    return color("text-medium");
  } else if (props.item.collection_position) {
    return color("saturated-yellow");
  } else if (props.type === "collection") {
    return lighten("brand", 0.35);
  } else {
    return color("brand");
  }
}

export const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: ${getColorForIconWrapper};
  margin-right: 10px;
  flex-shrink: 0;
`;

export const TitleWrapper = styled.div`
  display: flex;
  grid-gap: 0.25rem;
  align-items: center;
`;

export const ContextText = styled("p")`
  line-height: 1.4em;
  color: ${color("text-medium")};
  margin-top: 0;
`;

export const Title = styled("h3")`
  margin-bottom: 4px;
  color: ${props => color(props.active ? "text-dark" : "text-medium")};
`;

export const ResultButton = styled.button`
  ${props => resultStyles(props)}
  padding-right: 0.5rem;
  text-align: left;
  cursor: pointer;
  &:hover {
    ${Title} {
      color: ${color("brand")};
    }
  }
`;

export const ResultLink = styled(Link)`
  ${props => resultStyles(props)}
`;

const resultStyles = props => `
  display: block;
  background-color: ${
    props.isSelected ? lighten("brand", 0.63) : "transparent"
  };
  min-height: ${props.compact ? "36px" : "54px"};
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};
  padding-left: 14px;
  padding-right: ${props.compact ? "20px" : space(3)};
  cursor: ${props.active ? "pointer" : "default"};

  &:hover {
    background-color: ${props.active ? lighten("brand", 0.63) : ""};

    h3 {
      color: ${props =>
        props.active || props.isSelected ? color("brand") : ""};
    }
  }

  ${Link.Root} {
    text-underline-position: under;
    text-decoration: underline ${color("text-light")};
    text-decoration-style: dashed;

    &:hover {
      color: ${props.active ? color("brand") : ""};
      text-decoration-color: ${props.active ? color("brand") : ""};
    }
  }

  ${Text} {
    margin-top: 0;
    margin-bottom: 0;
    font-size: 13px;
    line-height: 19px;
  }

  h3 {
    font-size: ${props.compact ? "14px" : "16px"};
    line-height: 1.2em;
    overflow-wrap: anywhere;
    margin-bottom: 0;
    color: ${props.active && props.isSelected ? color("brand") : ""};
  }

  .Icon-info {
    color: ${color("text-light")};
  }
`;

export const ResultLinkContent = styled.div`
  display: flex;
  align-items: start;
`;

export const Description = styled(Text)`
  padding-left: ${space(1)};
  margin-top: ${space(1)} !important;
  border-left: 2px solid ${lighten("brand", 0.45)};
`;

export const ContextContainer = styled.div`
  margin-left: 42px;
  margin-top: 12px;
  max-width: 620px;
`;

export const ResultSpinner = styled(LoadingSpinner)`
  display: flex;
  flex-grow: 1;
  align-self: center;
  justify-content: flex-end;
  margin-left: ${space(1)};
  color: ${color("brand")};
`;
