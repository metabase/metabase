import styled from "@emotion/styled";

import type { FlexProps } from "metabase/ui";
import { Flex } from "metabase/ui";

export const FilterPanelRoot = styled(Flex)<FlexProps>`
  border-bottom: 1px solid ${({ theme }) => theme.fn.themeColor("border")};
`;
