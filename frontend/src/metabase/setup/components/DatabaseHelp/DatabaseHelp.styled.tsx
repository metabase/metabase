import styled from "styled-components";
import { color } from "metabase/lib/colors";
import AddDatabaseHelpCard from "metabase/components/AddDatabaseHelpCard";

interface DatabaseHelpRootProps {
  isVisible: boolean;
}

export const DatabaseHelpRoot = styled.div<DatabaseHelpRootProps>`
  position: fixed;
  left: 1em;
  bottom: 1em;
  transform: ${props => `translateY(${props.isVisible ? "0" : "200%"})`};
  transition: transform 0.4s;
`;

export const DatabaseHelpCard = styled(AddDatabaseHelpCard)`
  border: 1px solid ${color("border")};
  background-color: ${color("white")};
`;
