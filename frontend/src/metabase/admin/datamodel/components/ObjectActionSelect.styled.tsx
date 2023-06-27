import { Link } from "react-router";
import { styled } from "metabase/ui/utils";
import { color } from "metabase/lib/colors";

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
