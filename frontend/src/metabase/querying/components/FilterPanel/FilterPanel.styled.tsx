import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import type { FlexProps } from "metabase/ui";
import { Flex } from "metabase/ui";

export const FilterPanelRoot = styled(Flex)<FlexProps>`
  border-bottom: 1px solid ${color("border")};
`;
