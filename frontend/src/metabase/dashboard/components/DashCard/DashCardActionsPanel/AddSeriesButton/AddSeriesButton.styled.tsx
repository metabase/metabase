import styled from "@emotion/styled";

import { DashCardActionButton } from "../DashCardActionButton/DashCardActionButton";

export const ActionButton = styled(DashCardActionButton)`
  position: relative;
`;

export const IconContainer = styled.span`
  display: flex;
`;

export const PlusIcon = styled(DashCardActionButton.Icon)`
  top: 0;
  left: 1;
`;
