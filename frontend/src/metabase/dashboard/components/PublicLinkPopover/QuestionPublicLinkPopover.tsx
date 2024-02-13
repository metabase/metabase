import { useState } from "react";
import { useDispatch } from "metabase/lib/redux";
import {
  exportFormats,
  publicQuestion as getPublicQuestionUrl,
} from "metabase/lib/urls";
import {
  createPublicLink,
  deletePublicLink,
} from "metabase/query_builder/actions";
import type Question from "metabase-lib/Question";
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
    await dispatch(deletePublicLink(question.card()));
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
    />
  );
};
