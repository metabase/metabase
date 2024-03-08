import styled from "@emotion/styled";

import EditableText from "metabase/core/components/EditableText";

export const HeaderRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

export const HeaderTitle = styled(EditableText)`
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
`;
