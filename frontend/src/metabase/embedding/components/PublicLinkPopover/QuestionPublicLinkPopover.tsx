import { useState } from "react";

import {
  useCreateCardPublicLinkMutation,
  useDeleteCardPublicLinkMutation,
} from "metabase/api";
import { type ExportFormat, exportFormats } from "metabase/common/types/export";
import {
  trackPublicLinkCopied,
  trackPublicLinkRemoved,
} from "metabase/public/lib/analytics";
import { publicQuestion as getPublicQuestionUrl } from "metabase/urls";
import type Question from "metabase-lib/v1/Question";

import { PublicLinkPopover } from "./PublicLinkPopover";

export const QuestionPublicLinkPopover = ({
  question,
  target,
  isOpen,
  onClose,
}: {
  question: Question;
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const uuid = question.publicUUID();

  const [extension, setExtension] = useState<ExportFormat | null>(null);

  const url = uuid
    ? getPublicQuestionUrl({
        uuid,
        type: extension,
      })
    : null;

  const [createPublicQuestionLink] = useCreateCardPublicLinkMutation();
  const [deletePublicQuestionLink] = useDeleteCardPublicLinkMutation();

  const handleCreatePublicQuestionLink = async () => {
    await createPublicQuestionLink({ id: question.id() });
  };
  const handleDeletePublicQuestionLink = async () => {
    trackPublicLinkRemoved({
      artifact: "question",
      source: "public-share",
    });
    await deletePublicQuestionLink({ id: question.id() });
  };

  const onCopyLink = () => {
    trackPublicLinkCopied({
      artifact: "question",
      format: extension ?? "html",
    });
  };

  return (
    <PublicLinkPopover
      target={target}
      isOpen={isOpen}
      onClose={onClose}
      createPublicLink={handleCreatePublicQuestionLink}
      deletePublicLink={handleDeletePublicQuestionLink}
      url={url}
      extensions={exportFormats}
      selectedExtension={extension}
      setSelectedExtension={setExtension}
      onCopyLink={onCopyLink}
    />
  );
};
