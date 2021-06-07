import styled from "styled-components";

export const AddDatabaseHelpCardHolder = styled.div`
  position: fixed;
  left: 1em;
  bottom: 1em;
  transform: translateY(200%);
  transition: all 0.4s;
  ${props => (props.isVisible ? "transform: translateY(0);" : "")}
`;
