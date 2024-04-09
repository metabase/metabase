import styled from "@emotion/styled";

import { alpha } from "metabase/lib/colors";
import { Flex } from "metabase/ui";

export const JoinConditionRoot = styled(Flex)`
  border-radius: 0.5rem;
  transition: background-color 300ms linear;
  background-color: ${alpha("brand", 0.15)};
`;
