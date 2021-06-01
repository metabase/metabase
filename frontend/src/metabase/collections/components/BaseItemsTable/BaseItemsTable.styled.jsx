import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const ColumnHeader = styled.th`
  font-weight: bold;
  color: ${color("text-light")};
`;

export const SortingIcon = styled(Icon).attrs({
  size: 8,
})`
  margin-left: 4px;
`;

export const SortingControlContainer = styled.div`
  display: flex;
  align-items: center;

  color: ${props => (props.isActive ? color("text-dark") : "")};

  cursor: pointer;
  user-select: none;

  .Icon {
    visibility: ${props => (props.isActive ? "visible" : "hidden")};
  }

  &:hover {
    color: ${color("text-dark")};

    .Icon {
      visibility: visible;
    }
  }
`;

export const TableItemSecondaryField = styled.p`
  font-size: 0.95em;
  font-weight: bold;
`;
