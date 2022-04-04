import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { breakpointMinExtraLarge } from "metabase/styled-components/theme";

export const CaptionRoot = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-medium")};
  font-weight: bold;
  margin-bottom: 1.5rem;

  ${breakpointMinExtraLarge} {
    margin-bottom: 2rem;
  }
`;
