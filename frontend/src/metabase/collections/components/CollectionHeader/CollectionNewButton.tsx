import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setOpenModal } from "metabase/redux/ui";
import { Tooltip } from "metabase/ui";

import { CollectionHeaderButton } from "./CollectionHeader.styled";

export const CollectionNewButton = () => {
  const dispatch = useDispatch();

  return (
    <Tooltip label={t`Create a new collection`} position="bottom">
      <div>
        <CollectionHeaderButton
          aria-label={t`Create a new collection`}
          icon="add_folder"
          onClick={() => dispatch(setOpenModal("collection"))}
        />
      </div>
    </Tooltip>
  );
};
