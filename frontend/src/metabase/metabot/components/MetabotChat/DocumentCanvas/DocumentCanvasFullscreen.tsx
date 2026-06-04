import type { JSONContent } from "@tiptap/core";
import { type KeyboardEvent, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Box, Icon, Loader, Modal, TextInput } from "metabase/ui";

import S from "./DocumentCanvas.module.css";
import { DocumentCanvasEditor } from "./DocumentCanvasEditor";

interface DocumentCanvasFullscreenProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  content: JSONContent;
  proposedDoc: JSONContent | null;
  isEditing: boolean;
  askForChanges: (instructions: string) => Promise<boolean>;
  onManualChange: (content: JSONContent) => void;
  onReviewResolved: (content: JSONContent) => void;
}

/**
 * Fullscreen document view with its own "Describe edits" chat box. The edit
 * instructions run as an ephemeral sub-conversation (they reuse the parent
 * conversation's context but never appear in the main chat).
 */
export function DocumentCanvasFullscreen({
  opened,
  onClose,
  title,
  content,
  proposedDoc,
  isEditing,
  askForChanges,
  onManualChange,
  onReviewResolved,
}: DocumentCanvasFullscreenProps) {
  const [prompt, setPrompt] = useState("");

  const submitPrompt = () => {
    const value = prompt.trim();
    if (value && !isEditing) {
      askForChanges(value);
      setPrompt("");
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      withCloseButton
      title={title}
      padding={0}
      styles={{ title: { fontWeight: 600 } }}
      data-testid="metabot-document-fullscreen"
    >
      <Box className={S.fullscreenColumn}>
        <Box className={S.fullscreenScroll}>
          <Box
            className={S.fullscreenPage}
            style={{ opacity: isEditing ? 0.5 : 1 }}
          >
            <DocumentCanvasEditor
              content={content}
              proposedDoc={proposedDoc}
              editable
              onManualChange={onManualChange}
              onReviewResolved={onReviewResolved}
            />
          </Box>
        </Box>
        <Box className={S.fullscreenFooter}>
          <TextInput
            className={S.describeInput}
            radius="xl"
            placeholder={t`Describe edits`}
            value={prompt}
            disabled={isEditing}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            rightSection={
              isEditing ? (
                <Loader size="xs" />
              ) : (
                <ActionIcon
                  variant="filled"
                  radius="xl"
                  disabled={prompt.trim() === ""}
                  onClick={submitPrompt}
                  aria-label={t`Send`}
                >
                  <Icon name="arrow_up" size={16} />
                </ActionIcon>
              )
            }
          />
        </Box>
      </Box>
    </Modal>
  );
}
