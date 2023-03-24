import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  align-items: center;
  color: ${color("text-medium")};
  display: flex;
  margin-left: auto;
  padding-right: ${space(1)};
  min-height: 3rem;
`;

export const Span = styled.span`
  margin-right: ${space(1)};
  min-width: 70px;
`;
