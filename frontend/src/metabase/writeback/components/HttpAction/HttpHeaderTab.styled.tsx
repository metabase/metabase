import styled from "@emotion/styled";
import ButtonBase from "metabase/core/components/Button";
import { color, alpha, lighten } from "metabase/lib/colors";

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
`;

export const Input = styled.input`
  width: 100%;
`;

export const ValueColumn = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const DeleteButton = styled(ButtonBase)`
  font-weight: bold;
  color: ${color("brand")};
  background-opacity: 0.25;

  &:hover {
    background-color: ${color("accent0-light")};
    background-opacity: 0.25;
  }
`;

export const AddButton = styled(ButtonBase)`
  font-weight: bold;
  color: ${color("brand")};
  background-opacity: 0.25;

  &:hover {
    background-color: ${color("accent0-light")};
    background-opacity: 0.25;
  }
`;

export const LeftHeader = styled.div``;

export const RightHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
`;

export const Title = styled.div`
  font-weight: 600;
`;
