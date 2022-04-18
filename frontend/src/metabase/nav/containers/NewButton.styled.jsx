import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";

import Link from "metabase/core/components/Link";

export const NewButtonLink = styled(Link)`
  display: flex;
  align-items: center;
  margin-right: ${space(1)};
  padding: 9px ${space(1)} 10px;
`;
