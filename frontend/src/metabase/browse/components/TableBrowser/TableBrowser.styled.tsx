import styled from "@emotion/styled";
import {
  breakpointMinMedium,
  breakpointMinSmall,
  space,
} from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";
import Card from "metabase/components/Card";
import Link from "metabase/core/components/Link";
import { GridItem } from "metabase/components/Grid";

export const TableGridItem = styled(GridItem)`
  width: 100%;

  ${breakpointMinSmall} {
    width: 50%;
  }

  ${breakpointMinMedium} {
    width: 33.33%;
  }
`;

export const TableLink = styled(Link)`
  display: block;
  margin-left: ${space(1)};
  overflow: hidden;
`;

export const TableActionLink = styled(Link)`
  line-height: initial;

  &:not(:first-of-type) {
    margin-left: ${space(1)};
  }
`;

export const TableCard = styled(Card)`
  padding-left: ${space(1)};
  padding-right: ${space(1)};

  ${TableActionLink} {
    visibility: hidden;
  }

  &:hover ${TableActionLink} {
    visibility: visible;
  }
`;

export const AddTableButton = styled.label<{ isLoading?: boolean }>`
  display: flex;
  gap: ${space(1)};
  align-items: center;
  padding: 1.5rem ${space(2)};
  color: ${color("text-dark")};
  font-size: 1rem;
  font-weight: bold;
  cursor: ${props => (props.isLoading ? "progress" : "pointer")};

  &:hover {
    color: ${props => (props.isLoading ? "inherit" : color("brand"))};
  }

  input[type="file"] {
    display: none;
  }
`;

export const LoadingStateContainer = styled.div`
  display: flex;
  transform: translateY(8px);
  align-items: center;
  height: 16px;
  color: ${color("brand")};
`;
