import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export const NavBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  border-bottom: 1px solid ${color("border")};
`;

export const ModelEducationButton = styled(Button).attrs({
  icon: "model",
  borderless: true,
})`
  color: ${color("text-dark")};
`;
