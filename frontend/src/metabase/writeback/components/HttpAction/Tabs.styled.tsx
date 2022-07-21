import styled from "@emotion/styled";
import ButtonBase from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;

  & > * ~ * {
    margin-left: ${space(1)};
    margin-right: ${space(1)};
  }
`;

export const Button = styled(ButtonBase)<{ active: boolean }>`
  color: ${props => (props.active ? color("brand") : color("text-light"))};
  padding: ${space(1)} ${space(2)};

  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: bold;

  &:hover {
    color: ${props => (props.active ? color("brand") : color("text-medium"))};
  }
`;
