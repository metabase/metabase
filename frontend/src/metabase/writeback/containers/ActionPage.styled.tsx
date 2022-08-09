import styled from "@emotion/styled";
import { color, alpha, lighten } from "metabase/lib/colors";

export const Container = styled.div`
  display: flex;
  flex-direction: column;

  height: 100%;
`;

export const Content = styled.div`
  flex-grow: 1;
  background-color: ${color("white")};
`;
