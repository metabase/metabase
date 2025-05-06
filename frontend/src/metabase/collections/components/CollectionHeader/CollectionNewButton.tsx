import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setOpenModal } from "metabase/redux/ui";
import { Tooltip } from "metabase/ui";

import { CollectionHeaderButton } from "./CollectionHeader.styled";
import { trackNewCollectionInitiated } from "./analytics";

export const CollectionNewButton = () => {
  const dispatch = useDispatch();

  return (
    <Tooltip label={t`Create a new collection`} position="bottom">
      <div>
        <CollectionHeaderButton
          aria-label={t`Create a new collection`}
          icon="add_folder"
          onClick={() => {
            trackNewCollectionInitiated();
            dispatch(setOpenModal("collection"));
          }}
        />
      </div>
    </Tooltip>
  );
};
