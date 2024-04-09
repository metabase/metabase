import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ErrorPageRoot = styled.div<{ bordered?: boolean }>`
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  ${({ bordered }) => bordered && `border: 1px solid ${color("border")};`}
  border-radius: 0.5rem;
  overflow: hidden;
`;

export const ResponsiveSpan = styled.span`
  overflow: hidden;
`;
