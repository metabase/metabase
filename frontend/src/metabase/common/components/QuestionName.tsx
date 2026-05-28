import { useGetCardQuery } from "metabase/api";
import { useTranslateContent } from "metabase/i18n/hooks";
import { getName } from "metabase/utils/name";
import type { CardId } from "metabase-types/api";

interface QuestionNameProps {
  id: CardId | null | undefined;
}

export const QuestionName = ({ id }: QuestionNameProps) => {
  if (id == null || (typeof id === "number" && isNaN(id))) {
    return null;
  }
  return <FetchedQuestionName id={id} />;
};

const FetchedQuestionName = ({ id }: { id: CardId }) => {
  const tc = useTranslateContent();
  const { currentData: card } = useGetCardQuery({ id });
  if (!card) {
    return null;
  }
  return <span>{tc(getName(card))}</span>;
};
