import styled from "styled-components";

import Link from "metabase/components/Link";
import Text from "metabase/components/type/Text";
import { color, lighten } from "metabase/lib/colors";

function getColorForIconWrapper(props) {
  if (props.item.collection_position) {
    return color("warning");
  }
  switch (props.type) {
    case "collection":
      return lighten("brand", 0.35);
    default:
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

export const ResultLink = styled(Link)`
  display: block;
  background-color: transparent;
  min-height: ${props => (props.compact ? "36px" : "54px")};
  padding-top: 8px;
  padding-bottom: 8px;
  padding-left: 14px;
  padding-right: ${props => (props.compact ? "20px" : "32px")};

  &:hover {
    background-color: ${lighten("brand", 0.63)};

    h3 {
      color: ${color("brand")};
    }
  }

  ${Link} {
    text-underline-position: under;
    text-decoration: underline ${color("text-light")};
    text-decoration-style: dashed;
    &:hover {
      color: ${color("brand")};
      text-decoration-color: ${color("brand")};
    }
  }

  ${Text} {
    margin-top: 0;
    margin-bottom: 0;
    font-size: 13px;
    line-height: 19px;
  }

  h3 {
    font-size: ${props => (props.compact ? "14px" : "16px")};
    line-height: 1.2em;
    word-wrap: break-word;
    margin-bottom: 0;
  }

  .Icon-info {
    color: ${color("text-light")};
  }
`;

export const CollectionLink = styled(Link)`
  text-decoration: dashed;
  &:hover {
    color: ${color("brand")};
  }
`;

export const Title = styled("h3")`
  margin-bottom: 4px;
`;

export const Context = styled("p")`
  line-height: 1.4em;
  color: ${color("text-medium")};
  margin-top: 0;
`;

export const Description = styled(Text)`
  padding-left: 8px;
  margin-top: 6px !important;
  border-left: 2px solid ${lighten("brand", 0.45)};
`;
