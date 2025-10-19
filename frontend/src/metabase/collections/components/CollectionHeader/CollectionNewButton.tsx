import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { useDispatch } from "metabase/lib/redux";
import { setOpenModal } from "metabase/redux/ui";

import { trackNewCollectionFromHeaderInitiated } from "./analytics";

export const CollectionNewButton = () => {
  const dispatch = useDispatch();

  return (
    <ToolbarButton
      icon="add_folder"
      aria-label={t`Create a new collection`}
      tooltipLabel={t`Create a new collection`}
      tooltipPosition="bottom"
      onClick={() => {
        trackNewCollectionFromHeaderInitiated();
        dispatch(setOpenModal("collection"));
      }}
    />
  );
};
