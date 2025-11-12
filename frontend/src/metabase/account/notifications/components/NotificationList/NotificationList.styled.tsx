// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Label from "metabase/common/components/type/Label";
import { Icon } from "metabase/ui";

export const NotificationHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
`;

export const NotificationLabel = styled(Label)`
  flex: 1 1 auto;
  margin: 0;
`;

export const NotificationSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const NotificationIcon = styled(Icon)`
  color: var(--mb-color-background-tertiary-inverse);
  width: 3.25rem;
  height: 3.25rem;
  margin-top: 4.875rem;
  margin-bottom: 1.75rem;
`;

export const NotificationMessage = styled.div`
  max-width: 24rem;
  text-align: center;
`;
