import styled from "styled-components";

import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const Container = styled.div`
  display: inline-flex;
  align-items: center;
  column-gap: ${space(0)};
`;

export const Label = styled.span`
  font-weight: 900;
  color: ${color("brand")};
  font-size: 12px;
`;
