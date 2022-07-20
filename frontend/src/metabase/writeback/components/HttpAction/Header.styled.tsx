import styled from "@emotion/styled";
import EditableTextBase from "metabase/core/components/EditableText";
import ButtonBase from "metabase/core/components/Button";
import { color, alpha, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background-color: ${color("white")};
`;

export const LeftHeader = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-light")};

  & > * ~ * {
    margin-left: ${space(2)};
    margin-right: ${space(2)};
  }
`;

export const RightHeader = styled(ButtonBase)`
  font-weight: bold;
  color: ${color("brand")};
  background-opacity: 0.25;

  &:hover {
    background-color: ${color("accent0-light")};
    background-opacity: 0.25;
  }
`;

export const EditableText = styled(EditableTextBase)`
  font-weight: bold;
`;

export const Option = styled.div`
  color: ${color("text-light")};
`;
