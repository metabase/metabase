import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const ControlContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1rem;
`;

export const HoverableIcon = styled(Icon)`
  cursor: pointer;
  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const PopoverContent = styled.div`
  padding: 1.5rem;
`;

export const FeatureTitle = styled.h4`
  color: var(--mb-color-text-dark);
  font-weight: 700;
`;

export const FeatureDescriptionText = styled.p`
  color: var(--mb-color-text-medium);
  font-weight: 400;
`;

export const ErrorMessage = styled.p`
  width: 80%;
  color: var(--mb-color-error);
  line-height: 1.5rem;
`;
