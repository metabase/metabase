import styled from "@emotion/styled";

import { EditableDescription } from "metabase/common/components/EditableDescription";
import EditableText from "metabase/core/components/EditableText";

export const CaptionTitleContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const CaptionTitle = styled(EditableText)`
  font-size: 1.75rem;
  font-weight: 900;
`;

export interface CaptionDescriptionProps {
  isVisible: boolean;
}

export const CaptionDescription = styled(
  EditableDescription,
)<CaptionDescriptionProps>`
  opacity: ${props => (props.isVisible ? 1 : 0)};
  max-width: 25rem;
  transition: opacity 400ms ease 1s;

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;

export const CaptionRoot = styled.div`
  &:hover,
  &:focus-within {
    ${CaptionDescription} {
      opacity: 1;
      transition-delay: 0s;
    }
  }
`;
