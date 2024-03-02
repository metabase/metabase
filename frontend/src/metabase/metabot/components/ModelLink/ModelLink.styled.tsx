import styled from "@emotion/styled";

import Link from "metabase/core/components/Link/Link";
import { color } from "metabase/lib/colors";

export const ModelLinkRoot = styled(Link)`
  display: inline-flex;
  align-items: center;
  color: ${color("brand")};
  font-weight: bold;
`;
