import styled from "@emotion/styled";

import { ViewTitleHeader } from "metabase/query_builder/components/view/ViewHeader";

const headerHeight = "4rem";

export const BorderedViewTitleHeader = styled(ViewTitleHeader)`
  border-bottom: 1px solid var(--mb-color-border);
  padding-top: 8px;
  padding-bottom: 8px;
  min-height: ${headerHeight};
`;
export const QueryBuilderViewHeaderContainer = styled.div`
  flex-shrink: 0;
  background-color: var(--mb-color-bg-white);
  position: relative;
  z-index: 3;
`;
