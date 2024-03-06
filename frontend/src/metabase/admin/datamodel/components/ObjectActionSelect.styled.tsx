import styled from "@emotion/styled";
import { Link } from "react-router";
import { color } from "metabase/ui/utils/colors";

export const ActionLink = styled(Link)`
  display: block;
  padding: 0.5rem 1rem;
  cursor: pointer;
  text-decoration: none;

  &:hover {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;

export const TriggerIconContainer = styled.span`
  color: ${color("text-light")};

  &:hover {
    color: ${color("brand")};
  }
`;
