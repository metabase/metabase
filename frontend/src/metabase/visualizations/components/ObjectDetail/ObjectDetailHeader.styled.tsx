import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ObjectDetailHeaderWrapper = styled.div`
  flex-shrink: 0;
  display: flex;
  position: relative;
  border-bottom: 1px solid ${color("border")};
`;

export const ObjectIdLabel = styled.span`
  color: ${color("text-medium")};
  margin-left: 0.5rem;
`;

export const CloseButton = styled.div`
  display: flex;
  margin-left: 1rem;
  padding-left: 1rem;
  border-left: 1px solid ${color("border")};
`;
