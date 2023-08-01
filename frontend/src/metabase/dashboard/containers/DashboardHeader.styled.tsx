import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

import Button from "metabase/core/components/Button";
import { breakpointMaxSmall } from "metabase/styled-components/theme";

export const DashboardHeaderActionDivider = styled.div`
  height: 1.25rem;
  padding-left: 0.5rem;
  margin-left: 0.5rem;
  width: 0px;
  border-left: 1px solid ${color("border")};
`;

export const DashboardHeaderButton = styled(Button)<{
  isActive?: boolean;
  visibleOnSmallScreen?: boolean;
}>`
  padding: 0.25rem 0.5rem;
  height: 2rem;
  min-width: 2rem;
  color: ${props => (props.isActive ? color("brand") : color("text-dark"))};
  font-size: 1rem;

  &:hover {
    color: ${color("brand")};
    background-color: ${color("bg-medium")};
  }

  svg {
    vertical-align: middle;
  }

  ${breakpointMaxSmall} {
    ${props =>
      !props.visibleOnSmallScreen &&
      css`
        display: none;
      `}
  }
`;

DashboardHeaderButton.defaultProps = {
  onlyIcon: true,
  iconSize: 20,
  visibleOnSmallScreen: true,
};
