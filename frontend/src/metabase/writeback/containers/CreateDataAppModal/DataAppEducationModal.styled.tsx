import styled from "@emotion/styled";

import Icon from "metabase/components/Icon";

import { alpha, color } from "metabase/lib/colors";

export const ModalContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  text-align: center;
`;

export const IconContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;

  margin-top: 2rem;
`;

export const AppIcon = styled(Icon)`
  display: block;
  color: ${color("brand")};
`;

export const InsightIcon = styled(Icon)`
  display: block;
  color: ${alpha(color("brand"), 0.5)};

  margin-left: 3rem;
  margin-top: 1rem;
`;

export const MessageContent = styled.div`
  width: 70%;
`;

export const ModalMessage = styled.span`
  display: block;
  color: ${color("text-dark")};

  font-size: 1.14rem;
  font-weight: 700;

  margin-top: 2.4rem;
`;

export const ModalSubtitle = styled.span`
  display: block;
  color: ${alpha(color("text-dark"), 0.66)};
  margin-top: 1rem;
  margin-bottom: 2rem;
`;
