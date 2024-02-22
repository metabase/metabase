import styled from "@emotion/styled";

import Label from "metabase/components/type/Label";
import { color } from "metabase/lib/colors";

export const LoginGroup = styled.div`
  padding: 1rem 0;
`;

export const LoginItemContent = styled.div`
  display: flex;
  align-items: center;
`;

export const LoginItemInfo = styled.div`
  display: flex;
  margin-left: auto;
`;

export const LoginActiveLabel = styled(Label)`
  color: ${color("summarize")};
`;
