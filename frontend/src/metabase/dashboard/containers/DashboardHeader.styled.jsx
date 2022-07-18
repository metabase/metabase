import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

import Button from "metabase/core/components/Button";

export const DashboardHeaderActionDivider = styled.div`
  height: 1.25rem;
  padding-left: 0.5rem;
  margin-left: 0.5rem;
  width: 0px;
  border-left: 1px solid ${color("border-dark")};
`;

export const DashboardHeaderButton = styled(Button)`
  padding: 0.25rem 0.5rem;
  height: 2rem;
  width: 2rem;
  color: ${props => (props.isActive ? color("brand") : color("text-dark"))};

  &:hover {
    color: ${color("brand")};
    background-color: ${color("bg-medium")};
  }

  svg {
    vertical-align: middle;
  }
`;

DashboardHeaderButton.defaultProps = {
  onlyIcon: true,
  iconSize: 16,
};
