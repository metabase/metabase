import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

import Link from "metabase/core/components/Link";

export const Container = styled.div`
  box-sizing: border-box;
  color: ${({ isNightMode }) => (isNightMode ? "white" : "inherit")};
  margin-top: ${space(4)};
`;

export const BrandLink = styled(Link)`
  color: ${color("brand")};
  font-weight: bold;
`;
