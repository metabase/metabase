import styled from "styled-components";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const ItemLink = styled(Link)`
  display: block;
  background-color: ${color("bg-medium")};
  color: ${color("text-medium")};
  border-radius: 8px;

  &:hover {
    color: ${color("brand")};
  }
`;

export const IconContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 42px;
  width: 42px;
  background-color: ${props => color(props.color || "bg-dark")};
  margin-right: ${space(1)};
  border-radius: 6px;
`;

export const CardContent = styled.div`
  display: flex;
  align-items: center;
  padding: ${space(1)};
`;

export const CollectionIcon = styled(Icon)`
  color: ${color("white")};
`;
