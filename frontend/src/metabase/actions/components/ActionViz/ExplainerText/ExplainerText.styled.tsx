// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { space } from "metabase/styled-components/theme";

export const ExplainerTextContainer = styled.p`
  color: var(--mb-color-text-medium);
`;

export const BrandLinkWithLeftMargin = styled(ExternalLink)`
  margin-left: ${space(1)};
  color: var(--mb-color-brand);
`;
