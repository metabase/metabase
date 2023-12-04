import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  exportFormats,
  publicQuestion as getPublicQuestionUrl,
} from "metabase/lib/urls";
import {
  createPublicLink,
  deletePublicLink,
} from "metabase/query_builder/actions";
import { getSetting } from "metabase/selectors/settings";
import type Question from "metabase-lib/Question";
import { PublicLinkPopover } from "./PublicLinkPopover";
import type { ExportFormatType } from "./PublicLinkPopover";

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

  const siteUrl = useSelector(state => getSetting(state, "site-url"));

  const uuid = question.publicUUID();
  const getPublicLink = ({
    exportFormat,
  }: {
    exportFormat: ExportFormatType;
  }) =>
    getPublicQuestionUrl({
      uuid,
      type: exportFormat,
      siteUrl,
    });

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
      uuid={uuid}
      getPublicLink={getPublicLink}
      extensions={exportFormats}
    />
  );
};
