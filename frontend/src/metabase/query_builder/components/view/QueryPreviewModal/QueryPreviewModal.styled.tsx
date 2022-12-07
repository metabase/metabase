import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const ModalRoot = styled.div`
  display: flex;
  flex-direction: column;
  padding: 2rem;
  min-height: 20rem;
  max-height: 90vh;
`;

export const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
`;

export const ModalBody = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
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
`;

export const ModalCloseIcon = styled(Icon)`
  color: ${color("text-light")};
`;

export const ModalLoadingSpinner = styled(LoadingSpinner)`
  color: ${color("brand")};
`;
