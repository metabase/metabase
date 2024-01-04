import styled from "@emotion/styled";
import { Flex } from "metabase/ui";
import type { FlexProps } from "metabase/ui";
import { color } from "metabase/lib/colors";

export const FilterPanelRoot = styled(Flex)<FlexProps>`
  border-bottom: 1px solid ${color("border")};
`;
