import styled from "@emotion/styled";

import { alpha } from "metabase/lib/colors";
import type { FlexProps } from "metabase/ui";
import { Flex } from "metabase/ui";

export const FilterPillRoot = styled(Flex)<FlexProps>`
  cursor: pointer;
  color: ${({ theme }) => theme.fn.themeColor("filter")};
  background-color: ${({ theme }) => alpha(theme.fn.themeColor("filter"), 0.2)};
  border-radius: 0.75rem;
`;
