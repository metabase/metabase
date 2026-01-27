// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { darken } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const StoreIconRoot = styled(ExternalLink)`
  margin-right: var(--mantine-spacing-sm);
`;

export const StoreIconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--mb-color-text-primary-inverse);
  transition: all 300ms ease-in-out;

  &:hover {
    color: var(--mb-color-text-primary-inverse);
    background-color: ${() => darken("filter")};
  }

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;

export const StoreIcon = styled(Icon)`
  margin: var(--mantine-spacing-sm);
`;
