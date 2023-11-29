import styled from "@emotion/styled";

import { DashActionButton } from "../DashCardActionButton/DashCardActionButton";

export const ActionButton = styled(DashActionButton)`
  position: relative;
`;

export const IconContainer = styled.span`
  display: flex;
`;

export const PlusIcon = styled(DashActionButton.Icon)`
  top: 0;
  left: 1;
`;
