import styled from "styled-components";

import { color } from "metabase/lib/colors";
import Button from "metabase/components/Button";

export const Container = styled.div`
  min-width: 300px;
  margin: 1rem;
`;

export const Footer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
`;

export const UpdateButton = styled(Button).attrs({
  purple: true,
})`
  padding: 1rem;
  border: 1px solid ${color("border")};
  justify-self: end;
  grid-column-start: 2;
`;
