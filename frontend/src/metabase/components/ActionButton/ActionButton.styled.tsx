import { styled } from "metabase/ui/utils";

import LoadingSpinner from "metabase/components/LoadingSpinner/LoadingSpinner";

export const SmallSpinner = styled(LoadingSpinner)`
  display: flex;
  justify-content: center;
  width: 5rem;
  font-size: 0.5rem;
  div {
    height: 1.2rem;
    width: 1.2rem;
  }
`;
