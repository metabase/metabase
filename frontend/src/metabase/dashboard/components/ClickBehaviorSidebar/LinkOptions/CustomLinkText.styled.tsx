import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const Label = styled.label`
  display: block;

  color: ${color("text-dark")};
  font-weight: 700;

  padding-top: 22px;
  padding-bottom: 16px;
  margin-bottom: 8px;
`;
