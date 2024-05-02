import styled from "@emotion/styled";

import { Grid } from "metabase/ui";

export const RecentlyViewedModelsGrid = styled(Grid)`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: 0.5rem;
  margin: 0;
  width: 100%;
  margin-bottom: 0.5rem;
`;
