import styled from "@emotion/styled";

import SelectList from "metabase/components/SelectList";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const JoinStrategyIcon = styled(Icon)`
  color: ${color("brand")};
`;

export const JoinStrategyList = styled(SelectList)`
  padding: 0.5rem;
`;
