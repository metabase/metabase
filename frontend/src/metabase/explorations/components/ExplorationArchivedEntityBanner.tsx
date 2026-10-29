import { t } from "ttag";

import { useDeleteExplorationMutation } from "metabase/api";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import { useSetArchive } from "metabase/archive/hooks";
import { useSetCollection } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useNavigate } from "metabase/router";
import type { Exploration } from "metabase-types/api";

interface ExplorationArchivedEntityBannerProps {
  exploration: Exploration;
}

export const ExplorationArchivedEntityBanner = ({
  exploration,
}: ExplorationArchivedEntityBannerProps) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const archive = useSetArchive();
  const setCollection = useSetCollection();
  const [deleteExploration] = useDeleteExplorationMutation();

  return (
    <ArchivedEntityBanner
      name={exploration.name}
      entityType={t`research`}
      canMove={exploration.can_write}
      canRestore={exploration.can_restore}
      canDelete={exploration.can_delete}
      onUnarchive={() =>
        archive({ id: exploration.id, model: "exploration" }, false)
      }
      onMove={({ id }) =>
        setCollection({ model: "exploration", id: exploration.id }, { id })
      }
      onDeletePermanently={async () => {
        await deleteExploration(exploration.id).unwrap();
        navigate("/trash");
        dispatch(
          addUndo({ message: t`This item has been permanently deleted.` }),
        );
      }}
    />
  );
};
