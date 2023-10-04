import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const ModalRoot = styled.div`
  display: flex;
  flex-direction: column;
  padding: 2rem;
  min-width: 40rem;
  max-width: 85vw;
  min-height: 20rem;
  max-height: 90vh;
`;

export const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
`;

interface ModalBodyProps {
  isCentered?: boolean;
}

export const ModalBody = styled.div<ModalBodyProps>`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: ${props => props.isCentered && "center"};
  align-items: ${props => props.isCentered && "center"};
  min-height: 0;
`;

export const ModalFooter = styled.div`
  display: flex;
  justify-content: end;
  margin-top: 1.5rem;
`;

export const ModalTitle = styled.div`
  flex: 1 1 auto;
  color: ${color("text-dark")};
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const ModalWarningIcon = styled(Icon)`
  flex: 0 0 auto;
  color: ${color("error")};
  width: 1rem;
  height: 1rem;
  margin-right: 0.75rem;
`;

export const ModalCloseButton = styled(IconButtonWrapper)`
  flex: 0 0 auto;
  margin-left: 1rem;
`;

export const ModalCloseIcon = styled(Icon)`
  color: ${color("text-light")};
`;

export const ModalLoadingSpinner = styled(LoadingSpinner)`
  color: ${color("brand")};
`;

export const ModalDivider = styled.div`
  border-top: 1px solid ${color("border")};
  margin-bottom: 1.5rem;
`;
