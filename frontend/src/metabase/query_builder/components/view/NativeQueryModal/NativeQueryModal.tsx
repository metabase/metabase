import { ReactNode } from "react";
import { t } from "ttag";
import NativeCodePanel from "../NativeCodePanel";
import {
  ModalBody,
  ModalCloseButton,
  ModalCloseIcon,
  ModalDivider,
  ModalFooter,
  ModalHeader,
  ModalLoadingSpinner,
  ModalRoot,
  ModalTitle,
  ModalWarningIcon,
} from "./NativeQueryModal.styled";

interface NativeQueryModalProps {
  title: string;
  query?: string;
  error?: string;
  isLoading?: boolean;
  children?: ReactNode;
  onClose?: () => void;
}

const NativeQueryModal = ({
  title,
  query,
  error,
  isLoading,
  children,
  onClose,
}: NativeQueryModalProps): JSX.Element => {
  return (
    <ModalRoot>
      <ModalHeader>
        {error && <ModalWarningIcon name="warning" />}
        <ModalTitle>
          {error ? t`An error occurred in your query` : title}
        </ModalTitle>
        <ModalCloseButton>
          <ModalCloseIcon name="close" onClick={onClose} />
        </ModalCloseButton>
      </ModalHeader>
      {error && <ModalDivider />}
      <ModalBody isCentered={isLoading}>
        {isLoading ? (
          <ModalLoadingSpinner />
        ) : error ? (
          <NativeCodePanel value={error} isHighlighted />
        ) : query ? (
          <NativeCodePanel value={query} isCopyEnabled />
        ) : null}
      </ModalBody>
      {children && <ModalFooter>{children}</ModalFooter>}
    </ModalRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NativeQueryModal;
