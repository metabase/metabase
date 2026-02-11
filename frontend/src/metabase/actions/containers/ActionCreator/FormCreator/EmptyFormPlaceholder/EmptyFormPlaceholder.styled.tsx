// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import ExternalLink from "metabase/common/components/ExternalLink";
import { lighten } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const EmptyFormPlaceholderWrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  padding: 3rem;
`;

export const ExplainerTitle = styled.h3`
  margin-bottom: var(--mantine-spacing-sm);
`;

export const ExplainerText = styled.div`
  font-weight: 400;
  line-height: 1.5rem;
  color: var(--mb-color-text-secondary);
  margin: var(--mantine-spacing-sm) 0 0 0;
`;

export const ExplainerList = styled.ul`
  list-style-type: disc;
  margin-left: 1.5rem;

  li {
    font-weight: 400;
    line-height: 24px;
    color: var(--mb-color-text-secondary);
    margin: 0;
  }
`;

export const ExplainerLink = styled(ExternalLink)`
  font-weight: 700;
  margin-top: var(--mantine-spacing-md);
  color: var(--mb-color-brand);

  &:hover {
    color: ${() => lighten("brand", 0.1)};
  }
`;

export const IconContainer = styled.div`
  display: inline-block;
  padding: 1.25rem;
  position: relative;
  color: var(--mb-color-brand);
  align-self: center;
`;

export const TopRightIcon = styled(Icon)`
  position: absolute;
  top: 0;
  right: 0;
`;
