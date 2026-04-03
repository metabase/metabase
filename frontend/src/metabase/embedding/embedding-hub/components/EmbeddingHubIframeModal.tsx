import { useState } from "react";

import { Center, Loader, Modal } from "metabase/ui";

import S from "./EmbeddingHubIframeModal.module.css";

interface EmbeddingHubIframeModalProps {
  src: string | null;
  onClose: () => void;
}

export const EmbeddingHubIframeModal = ({
  src,
  onClose,
}: EmbeddingHubIframeModalProps) => {
  const [isLoading, setIsLoading] = useState(true);

  const handleLoad = () => setIsLoading(false);

  const handleClose = () => {
    setIsLoading(true);
    onClose();
  };

  return (
    <Modal
      opened={!!src}
      onClose={handleClose}
      size="90vw"
      withCloseButton
      centered
      zIndex={400}
      classNames={{
        content: S.content,
        header: S.header,
        body: S.body,
      }}
    >
      {isLoading && (
        <Center h="100%">
          <Loader />
        </Center>
      )}
      {src && (
        <iframe
          src={src}
          title="Setup"
          onLoad={handleLoad}
          className={S.iframe}
          hidden={isLoading}
        />
      )}
    </Modal>
  );
};
