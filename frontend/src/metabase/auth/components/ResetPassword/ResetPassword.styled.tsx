import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const FormTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  text-align: center;
  margin-bottom: 1rem;
`;

export const FormMessage = styled.div`
  color: ${color("text-dark")};
  text-align: center;
  margin-bottom: 1.5rem;
`;
