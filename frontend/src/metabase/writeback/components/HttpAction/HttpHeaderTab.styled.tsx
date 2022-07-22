import styled from "@emotion/styled";
import ButtonBase from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-gap: 0.5rem;
`;

export const Input = styled.input`
  display: flex;
  height: 100%;
  width: 100%;
  border: none;
  background-color: ${color("bg-medium")};
  padding: ${space(1)} ${space(1)};
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  width: 100%;
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

export const TitleRowContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const LeftHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
`;

export const RightHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 100%;
`;

export const Title = styled.span`
  display: block;
  font-weight: 600;
`;
