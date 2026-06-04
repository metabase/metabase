import { type KeyboardEvent, useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import type { MetabotAgentId } from "metabase/metabot/state";
import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Icon,
  Loader,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";

import S from "./DocumentCanvas.module.css";
import { DocumentCanvasEditor } from "./DocumentCanvasEditor";
import { DocumentCanvasFullscreen } from "./DocumentCanvasFullscreen";
import { copyDocument, downloadDocument } from "./documentExport";
import { useDocumentCanvas } from "./useDocumentCanvas";

interface DocumentCanvasEmbedProps {
  documentId: number;
  agentId: MetabotAgentId;
}

/**
 * The inline, ChatGPT-canvas-style document artifact rendered in the chat. Shows
 * the agent-authored document with an "Ask for changes" prompt, an edit toggle,
 * copy / download actions, and a button to expand into the fullscreen view.
 */
export function DocumentCanvasEmbed({
  documentId,
  agentId,
}: DocumentCanvasEmbedProps) {
  const {
    document,
    isLoading,
    content,
    title,
    proposedDoc,
    isEditing,
    onManualChange,
    askForChanges,
    onReviewResolved,
  } = useDocumentCanvas(documentId, agentId);

  const [editable, setEditable] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  if (isLoading || !content || !document) {
    return (
      <Flex align="center" gap="sm" p="md">
        <Loader size="sm" />
        <Text c="text-secondary">{t`Building your document…`}</Text>
      </Flex>
    );
  }

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
    <>
      <Box className={S.embed} data-testid="metabot-document-canvas">
        <Flex className={S.toolbar} align="center" gap="sm">
          <TextInput
            flex={1}
            size="xs"
            variant="unstyled"
            placeholder={t`Ask for changes`}
            value={prompt}
            disabled={isEditing}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            leftSection={<Icon name="pencil" size={14} />}
            rightSection={
              isEditing ? (
                <Loader size="xs" />
              ) : (
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  disabled={prompt.trim() === ""}
                  onClick={submitPrompt}
                  aria-label={t`Send`}
                >
                  <Icon name="arrow_up" size={14} />
                </ActionIcon>
              )
            }
          />
          <Group gap={4}>
            <Tooltip label={editable ? t`Done editing` : t`Edit`}>
              <ActionIcon
                variant={editable ? "filled" : "subtle"}
                onClick={() => setEditable((v) => !v)}
                aria-label={t`Edit`}
              >
                <Icon name="pencil" size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t`Copy`}>
              <ActionIcon
                variant="subtle"
                onClick={() => copyDocument(content)}
                aria-label={t`Copy`}
              >
                <Icon name="copy" size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t`Download`}>
              <ActionIcon
                variant="subtle"
                onClick={() => downloadDocument(content, title)}
                aria-label={t`Download`}
              >
                <Icon name="download" size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t`View in full screen`}>
              <ActionIcon
                variant="subtle"
                onClick={() => setFullscreen(true)}
                aria-label={t`View in full screen`}
              >
                <Icon name="expand" size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Flex>

        <Box
          className={S.paper}
          style={{ opacity: isEditing ? 0.5 : 1 }}
          data-testid="metabot-document-canvas-paper"
        >
          <DocumentCanvasEditor
            content={content}
            proposedDoc={proposedDoc}
            editable={editable}
            onManualChange={onManualChange}
            onReviewResolved={onReviewResolved}
          />
        </Box>

        <Flex className={S.footer} align="center" justify="flex-end">
          <Link to={Urls.document(document)}>
            <Flex align="center" gap="xs" c="brand">
              <Icon name="document" size={14} />
              <Text c="brand" fw={600}>{t`Open document`}</Text>
            </Flex>
          </Link>
        </Flex>
      </Box>

      {fullscreen && (
        <DocumentCanvasFullscreen
          opened={fullscreen}
          onClose={() => setFullscreen(false)}
          title={title}
          content={content}
          proposedDoc={proposedDoc}
          isEditing={isEditing}
          askForChanges={askForChanges}
          onManualChange={onManualChange}
          onReviewResolved={onReviewResolved}
        />
      )}
    </>
  );
}
