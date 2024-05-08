import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

/**
 * TODO: Embedding Dark Mode
 * PreviousValueNumber is lighten(text-medium, 0.45)
 * PreviousValueDetails is lighten(text-light, 0.25)
 * Separator is lighten(text-medium, 0.15)
 * Variation when changeColor empty is lighten(text-medium, 0.3)
 */

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
