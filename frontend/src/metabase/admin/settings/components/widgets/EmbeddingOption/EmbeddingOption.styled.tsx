import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import Card from "metabase/components/Card";
import { Icon } from "metabase/core/components/Icon";

export const StyledCard = styled(Card)`
  padding: 2rem;
  width: 100%;
  max-width: 31.25rem;
`;

export const Label = styled.span`
  margin-bottom: ${space(2)};
  padding: ${space(0)} ${space(1)};
  display: inline-block;

  line-height: 1.3;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 0.25rem;
  text-transform: uppercase;
  color: ${color("brand")};
  background: ${color("brand-light")};
`;

export const Header = styled.h2`
  font-size: 0.875rem;
  margin-bottom: ${space(1)};
`;

export const Description = styled.p`
  margin-top: 0;
  margin-bottom: ${space(2)};
  color: ${color("text-medium")};
`;

export const MoreDetails = styled.span`
  font-weight: 700;
`;

export const StyledIcon = styled(Icon)`
  margin-left: ${space(1)};
`;
