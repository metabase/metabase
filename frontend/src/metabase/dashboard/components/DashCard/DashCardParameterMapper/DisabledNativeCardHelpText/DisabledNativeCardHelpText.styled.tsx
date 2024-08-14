import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { Icon } from "metabase/ui";

export const NativeCardDefault = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const NativeCardIcon = styled(Icon)`
  color: var(--mb-color-text-medium);
  margin-bottom: 0.5rem;
  width: 1.25rem;
  height: 1.25rem;
`;

export const NativeCardText = styled.div`
  color: var(--mb-color-text-dark);
  max-width: 15rem;
  text-align: center;
  line-height: 1.5rem;
`;

export const NativeCardLink = styled(ExternalLink)`
  color: var(--mb-color-brand);
  font-weight: bold;
  margin-top: 0.5rem;
`;
