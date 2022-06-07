import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

export const TimeContainer = styled.div<{ isSidebar?: boolean }>`
  display: flex;
  grid-gap: ${space(2)};
  flex-wrap: ${({ isSidebar }) => (isSidebar ? "wrap" : "no-wrap")};
`;
