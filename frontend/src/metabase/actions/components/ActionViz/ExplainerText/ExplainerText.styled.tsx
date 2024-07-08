import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const ExplainerTextContainer = styled.p`
  margin-left: ${space(3)};
  margin-right: ${space(3)};
  color: ${color("text-medium")};
`;

export const BrandLinkWithLeftMargin = styled(ExternalLink)`
  margin-left: ${space(1)};
  color: ${color("brand")};
`;
