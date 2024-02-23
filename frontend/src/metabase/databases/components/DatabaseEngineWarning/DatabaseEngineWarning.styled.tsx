import styled from "@emotion/styled";

import Alert from "metabase/core/components/Alert";
import { color } from "metabase/lib/colors";

export const Warning = styled(Alert)`
  margin-bottom: 2rem;
`;

export const WarningLink = styled.a`
  color: ${color("brand")};
  cursor: pointer;
  font-weight: bold;
`;
