import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link/Link";

export const ModelLinkRoot = styled(Link)`
  display: inline-flex;
  align-items: center;
  color: ${color("brand")};
  font-weight: bold;
`;
