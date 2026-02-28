// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Icon } from "metabase/ui";

interface VariationIconProps {
  gap?: number;
}

export const VariationIcon = styled(Icon)<VariationIconProps>`
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  margin-right: ${(props) =>
    props.gap !== undefined ? `${props.gap}px` : "var(--mantine-spacing-sm)"};
`;

export const VariationValue = styled(Ellipsified)`
  font-weight: 900;
`;
