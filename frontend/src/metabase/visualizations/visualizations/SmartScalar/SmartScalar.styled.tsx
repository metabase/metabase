import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const VariationIcon = styled(Icon)`
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  margin-right: ${space(1)};
  color: ${props => props.color};
`;

export const VariationValue = styled(Ellipsified)`
  font-weight: 900;
`;
