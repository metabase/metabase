import styled from "@emotion/styled";
import ButtonBase from "metabase/core/components/Button";
import { color, alpha, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Content = styled.div``;
export const Select = styled.select``;
export const Label = styled.div``;

export const Button = styled(ButtonBase)`
  display: flex;
  align-items: center;
  padding: ${space(0)} ${space(1)};
`;

export const ButtonContent = styled.div`
  display: flex;
  align-items: center;
`;

export const Option = styled(ButtonBase)<{ active: boolean }>`
  color: ${props => (props.active ? color("brand") : color("text-light"))};
  padding: ${space(1)} ${space(2)};
  font-weight: bold;

  &:hover {
    color: ${props => (props.active ? color("brand") : color("text-medium"))};
  }
`;
