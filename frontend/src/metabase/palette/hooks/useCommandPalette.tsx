import { t } from "ttag";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { useDispatch } from "metabase/lib/redux";
import type { IconName } from "metabase/ui";
import { setOpenModal } from "metabase/redux/ui";
import * as Urls from "metabase/lib/urls";

type CommandPalletAction = {
  name: string;
  icon: IconName;
  run: (arg?: string) => void;
};

export const useCommandPalette = ({ query }: { query: string }) => {
  const dispatch = useDispatch();

  const defaultActions = useMemo<CommandPalletAction[]>(
    () => [
      {
        name: t`Create New Collection`,
        icon: "add",
        run: () => dispatch(setOpenModal("collection")),
      },
      {
        name: t`Create New Dashboard`,
        icon: "add",
        run: () => dispatch(setOpenModal("dashboard")),
      },
      {
        name: t`Create New Question`,
        icon: "add",
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
      ? defaultActions.filter(action => action.name.includes(query))
      : defaultActions,
  };
};
