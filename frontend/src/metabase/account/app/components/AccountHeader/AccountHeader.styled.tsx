// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { UserAvatar } from "metabase/common/components/UserAvatar";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const AccountHeaderRoot = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding-top: var(--mantine-spacing-sm);
  border-bottom: 1px solid var(--mb-color-border);
  background-color: var(--mb-color-background-primary);

  ${breakpointMinSmall} {
    padding-top: var(--mantine-spacing-md);
  }
`;

export const HeaderSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--mantine-spacing-md);

  ${breakpointMinMedium} {
    padding: 4rem;
  }
`;

export const HeaderTitle = styled.h2`
  font-size: 1rem;
  text-align: center;
  margin-bottom: var(--mantine-spacing-xs);
`;

export const HeaderSubtitle = styled.h3`
  text-align: center;
  color: var(--mb-color-text-secondary);
`;

export const HeaderAvatar = styled(UserAvatar)`
  width: 3em;
  height: 3em;
  margin-bottom: var(--mantine-spacing-sm);

  ${breakpointMinSmall} {
    width: 4em;
    height: 4em;
    margin-bottom: var(--mantine-spacing-md);
  }

  ${breakpointMinMedium} {
    width: 5em;
    height: 5em;
  }
`;
