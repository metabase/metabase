import { useState } from "react";

import { useDispatch } from "metabase/lib/redux";
import {
  exportFormats,
  publicQuestion as getPublicQuestionUrl,
} from "metabase/lib/urls";
import {
  trackPublicLinkCopied,
  trackPublicLinkRemoved,
} from "metabase/public/lib/analytics";
import {
  createPublicLink,
  deletePublicLink,
} from "metabase/query_builder/actions";
import type Question from "metabase-lib/v1/Question";

import { PublicLinkPopover } from "./PublicLinkPopover";
import type { ExportFormatType } from "./types";

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
  const dispatch = useDispatch();

  const uuid = question.publicUUID();

  const [extension, setExtension] = useState<ExportFormatType | null>(null);

  const url = uuid
    ? getPublicQuestionUrl({
        uuid,
        type: extension,
      })
    : null;

  const createPublicQuestionLink = async () => {
    await dispatch(createPublicLink(question.card()));
  };
  const deletePublicQuestionLink = async () => {
    trackPublicLinkRemoved({
      artifact: "question",
      source: "public-share",
    });
    await dispatch(deletePublicLink(question.card()));
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
      createPublicLink={createPublicQuestionLink}
      deletePublicLink={deletePublicQuestionLink}
      url={url}
      extensions={exportFormats}
      selectedExtension={extension}
      setSelectedExtension={setExtension}
      onCopyLink={onCopyLink}
    />
  );
};
