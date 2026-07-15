// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Link } from "metabase/common/components/Link";
import { Icon } from "metabase/ui";

export const SectionBody = styled.div`
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
`;

export const DatabaseLink = styled(Link)`
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
`;

export const DatabaseLinkIcon = styled(Icon)`
  color: var(--mb-color-input-focus);
  width: 1rem;
  height: 1rem;
  margin-right: 0.25rem;
`;

export const DatabaseLinkText = styled.span`
  color: var(--mb-color-core-brand);
  font-weight: bold;
`;

export const SchemaTriggerIcon = styled(Icon)`
  color: var(--mb-color-core-brand);
  width: 0.625rem;
  height: 0.625rem;
  margin-left: 0.25rem;
`;

export const SchemaTriggerText = styled.span`
  color: var(--mb-color-core-brand);
  font-weight: bold;
`;
