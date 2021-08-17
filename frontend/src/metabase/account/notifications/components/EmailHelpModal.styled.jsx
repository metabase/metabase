import styled from "styled-components";
import { space } from "metabase/styled-components/theme";

export const HelpMessage = styled.div`
  &:not(:last-child) {
    margin-bottom: ${space(2)};
  }
`;
