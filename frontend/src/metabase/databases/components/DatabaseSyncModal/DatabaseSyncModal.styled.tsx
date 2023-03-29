import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const ModalRoot = styled.div`
  position: relative;
`;

export const ModalBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2.5rem 3rem;
`;

export const ModalTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  margin-bottom: 0.75rem;
  text-align: center;
`;

export const ModalMessage = styled.div`
  color: ${color("text-dark")};
  line-height: 1.5rem;
  margin-bottom: 3rem;
  text-align: center;
`;

export const ModalIllustration = styled.img`
  margin-top: 1.5rem;
  margin-bottom: 3rem;
`;

export const ModalCloseIcon = styled(Icon)`
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 1rem;
  height: 1rem;
  color: ${color("text-light")};
  cursor: pointer;

  &:hover {
    color: ${color("text-medium")};
  }
`;
