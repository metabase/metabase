import { t } from "ttag";

import NewItemMenu from "metabase/containers/NewItemMenu";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_GO_MENU } from "metabase/plugins";
import type { CollectionId } from "metabase-types/api";

import { NewButton, NewButtonText } from "./NewItemButton.styled";

export interface NewItemButtonProps {
  collectionId?: CollectionId;
}

const NewItemButton = ({ collectionId }: NewItemButtonProps) => {
  const dispatch = useDispatch();

  return (
    <NewItemMenu
      trigger={
        <NewButton primary icon="add" aria-label={t`New`}>
          <NewButtonText>{t`New`}</NewButtonText>
        </NewButton>
      }
      appendMenuItems={PLUGIN_GO_MENU.getMenuItems(dispatch)}
      collectionId={collectionId}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NewItemButton;
