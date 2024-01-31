import { t } from "ttag";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { useDispatch } from "metabase/lib/redux";
import type { IconName } from "metabase/ui";
import { setOpenModal } from "metabase/redux/ui";
import * as Urls from "metabase/lib/urls";

export type CommandPaletteAction = {
  id: string;
  name: string;
  icon: IconName;
  run: (arg?: string) => void;
};

export const useCommandPalette = ({ query }: { query: string }) => {
  const dispatch = useDispatch();

  const defaultActions = useMemo<CommandPaletteAction[]>(
    () => [
      {
        id: "create_collection",
        name: t`Create new collection`,
        icon: "collection",
        run: () => dispatch(setOpenModal("collection")),
      },
      {
        id: "create_dashboard",
        name: t`Create new dashboard`,
        icon: "dashboard",
        run: () => dispatch(setOpenModal("dashboard")),
      },
      {
        id: "create_question",
        name: t`Create new question`,
        icon: "question",
        run: () =>
          dispatch(
            push(
              Urls.newQuestion({
                mode: "notebook",
                creationType: "custom_question",
              }),
            ),
          ),
      },
    ],
    [dispatch],
  );

  return {
    results: query
      ? defaultActions.filter(action =>
          action.name.toLowerCase().includes(query.toLowerCase()),
        )
      : defaultActions,
  };
};
