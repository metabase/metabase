import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const ActionQueryError = styled.div`
  margin-top: ${space(2)};
  white-space: nowrap;
  color: ${color("error")};
`;
