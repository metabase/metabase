import styled from "@emotion/styled";
import EditableText from "metabase/core/components/EditableText";

export const CaptionContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const CaptionTitle = styled(EditableText)`
  font-weight: 900;
`;

export const CaptionDescription = styled(EditableText)`
  font-size: 1rem;
  line-height: 1.5rem;
  margin-top: 1.15rem;
  max-width: 25rem;
`;
