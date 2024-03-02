import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const MembershipSelectContainer = styled.ul`
  padding: 0.5rem 0;
  width: 300px;
  max-height: 600px;
`;

interface MembershipSelectItemProps {
  isDisabled?: boolean;
}

export const MembershipSelectItem = styled.li<MembershipSelectItemProps>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: ${props => (props.isDisabled ? "unset" : "pointer")};
  padding: 0.5rem 1.5rem;
  background-color: ${color("white")};
  color: ${color("text-medium")};
  font-weight: 700;

  ${props =>
    !props.isDisabled &&
    css`
      &:hover {
        color: ${color("white")};
        background-color: ${color("filter")};

        .Icon {
          color: ${color("white")} !important;
        }
      }
    `}
`;

export const MembershipSelectHeader = styled.li`
  padding: 0.75rem 1.5rem 0.5rem 1.5rem;
  font-size: 12px;
  font-weight: 800;
  color: ${color("filter")};
`;

export const MembershipActionsContainer = styled.div`
  padding-left: 1rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
`;
