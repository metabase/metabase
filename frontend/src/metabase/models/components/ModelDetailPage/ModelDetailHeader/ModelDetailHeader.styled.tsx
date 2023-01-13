import styled from "@emotion/styled";

import EditableText from "metabase/core/components/EditableText";

import { color } from "metabase/lib/colors";

export const ModelTitle = styled(EditableText)`
  color: ${color("text-dark")};
  font-weight: 700;
  font-size: 1.25rem;
`;

export const ModelFootnote = styled.p`
  color: ${color("text-medium")};
  margin: 4px 0 0 4px;
`;

export const ModelHeader = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
`;

export const ModelHeaderButtonsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;
