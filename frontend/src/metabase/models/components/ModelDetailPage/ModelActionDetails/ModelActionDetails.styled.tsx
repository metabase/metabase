import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

import { color } from "metabase/lib/colors";

export const ActionTitle = styled.span`
  font-weight: 700;
`;

export const ActionListItem = styled(Button)`
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  border-radius: 8px;
  padding: 1rem;
  color: ${color("text-dark")};

  ${ActionTitle} {
    margin-left: 1rem;
  }

  &:hover {
    background-color: ${color("brand-light")};
    color: ${color("text-dark")};
  }
`;
