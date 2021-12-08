import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const PaddedContent = styled.div`
  padding: 24px;
`;

export const Divider = styled.div`
  height: 1px;
  width: 100%;
  background-color: ${color("bg-medium")};
  margin-bottom: 21px;
`;
