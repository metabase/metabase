import { t } from "ttag";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { CollectionId } from "metabase-types/api";

import { NewButton, NewButtonText } from "./NewItemButton.styled";

export interface NewItemButtonProps {
  collectionId?: CollectionId;
}

const NewItemButton = ({ collectionId }: NewItemButtonProps) => {
  const dispatch = useDispatch();

  // Construct the URL for the "New Question" page
  const handleNewQuestionClick = () => {
    const newQuestionUrl = Urls.newQuestion({
      mode: "notebook",
      creationType: "custom_question",
      collectionId,
      cardType: "question",
    });

    // Navigate to the New Question URL
    window.location.href = newQuestionUrl;
  };

  return (
    <NewButton
      primary
      icon="add"
      aria-label={t`New`}
      onClick={handleNewQuestionClick}
    >
      <NewButtonText>{t`New Question`}</NewButtonText>
    </NewButton>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemButton;
