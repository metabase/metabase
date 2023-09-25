import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";
import { breakpointMaxMedium, space } from "metabase/styled-components/theme";

export const Variation = styled.div`
  color: ${props => props.color};
  display: flex;
  align-items: center;
  max-width: 100%;
`;

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

export const VariationTooltip = styled(Ellipsified)`
  display: flex;
  align-items: center;
  gap: ${space(0)};
`;

export const PreviousValueWrapper = styled.div`
  max-width: 100%;
`;

export const PreviousValueContainer = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin: ${space(0)} ${space(1)};
  gap: ${space(0)};
  line-height: 1.2rem;

  ${breakpointMaxMedium} {
    margin: ${space(1)};
    flex-direction: column;
  }
`;

export const PreviousValue = styled.h4`
  color: ${color("text-light")};
`;

export const Separator = styled.span`
  display: inline-block;
  transform: scale(0.7);
`;

export const PreviousValueSeparator = styled(Separator)`
  color: ${color("text-light")};

  ${breakpointMaxMedium} {
    display: none;
  }
`;
