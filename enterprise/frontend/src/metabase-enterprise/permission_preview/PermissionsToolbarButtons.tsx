import { useState } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/permissions";
import { Modal } from "metabase/ui";

import { PreviewAsFrame } from "./PreviewAsFrame";
import { ViewAsModal } from "./ViewAsModal";
import type { StartPreviewRequest } from "./api";

export function PermissionsToolbarButtons() {
  const [isViewAsOpen, setIsViewAsOpen] = useState(false);
  const [isPreviewAsOpen, setIsPreviewAsOpen] = useState(false);
  const [previewRequest, setPreviewRequest] =
    useState<StartPreviewRequest | null>(null);

  const handlePreviewPick = (request: StartPreviewRequest) => {
    setIsPreviewAsOpen(false);
    setPreviewRequest(request);
  };

  return (
    <>
      <ToolbarButton
        text={t`View app as…`}
        icon="person"
        onClick={() => setIsViewAsOpen(true)}
      />
      <ToolbarButton
        text={t`Preview as…`}
        icon="eye"
        onClick={() => setIsPreviewAsOpen(true)}
      />
      <ViewAsModal
        opened={isViewAsOpen}
        onClose={() => setIsViewAsOpen(false)}
        path="/"
      />
      <ViewAsModal
        opened={isPreviewAsOpen}
        onClose={() => setIsPreviewAsOpen(false)}
        path="/"
        onPick={handlePreviewPick}
      />
      <Modal.Root
        opened={previewRequest != null}
        onClose={() => setPreviewRequest(null)}
        fullScreen
      >
        <Modal.Content>
          <Modal.Body p={0} h="100vh">
            {previewRequest != null && (
              <PreviewAsFrame
                key={getPreviewKey(previewRequest)}
                request={previewRequest}
                onSwitch={() => setIsPreviewAsOpen(true)}
                onExit={() => setPreviewRequest(null)}
              />
            )}
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}

/** A new person, or a group with other attribute values, remounts the frame, so the old port closes. */
function getPreviewKey({ type, id, attributes }: StartPreviewRequest) {
  return `${type}-${id}-${JSON.stringify(attributes ?? {})}`;
}
