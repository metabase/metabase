import { useMount } from "react-use";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { replace } from "metabase/router";

export const SlackConnectSuccess = () => {
  const dispatch = useDispatch();

  useMount(() => {
    dispatch(
      addUndo({
        message: t`Your Slack account has been connected successfully.`,
        icon: "check",
      }),
    );
    dispatch(replace("/"));
  });

  return null;
};
