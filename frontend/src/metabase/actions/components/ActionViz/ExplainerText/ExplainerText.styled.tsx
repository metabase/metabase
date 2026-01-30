// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { ExternalLink } from "metabase/common/components/ExternalLink";

export const ExplainerTextContainer = styled.p`
  margin-left: var(--mantine-spacing-xl);
  margin-right: var(--mantine-spacing-xl);
  color: var(--mb-color-text-secondary);
`;

export const BrandLinkWithLeftMargin = styled(ExternalLink)`
  margin-left: var(--mantine-spacing-sm);
  color: var(--mb-color-brand);
`;
