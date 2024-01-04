import styled from "@emotion/styled";
import { Flex } from "metabase/ui";
import type { FlexProps } from "metabase/ui";
import { alpha, color } from "metabase/lib/colors";

export const FilterPillRoot = styled(Flex)<FlexProps>`
  cursor: pointer;
  color: ${color("filter")};
  background-color: ${alpha("filter", 0.2)};
  border-radius: 0.75rem;
`;
