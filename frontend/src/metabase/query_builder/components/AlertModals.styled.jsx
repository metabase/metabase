import styled from "styled-components";
import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const AlertModalFooter = styled.div`
  display: flex;
  justify-content: right;
  align-items: center;
  margin-top: ${space(3)};
`;

export const AlertModalError = styled.div`
  color: ${color("error")};
`;
