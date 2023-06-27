import { styled } from "metabase/ui/utils";

import { color } from "metabase/lib/colors";

import LoadingSpinner from "metabase/components/LoadingSpinner";

export const PickerSpinner = styled(LoadingSpinner)`
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: ${color("brand")};
  margin-left: 0.5rem;
`;
