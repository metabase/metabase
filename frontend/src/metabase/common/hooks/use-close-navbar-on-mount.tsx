import { useMount } from "react-use";

import { closeNavbar } from "metabase/redux/app";
import { useDispatch } from "metabase/utils/redux";

export function useCloseNavbarOnMount() {
  const dispatch = useDispatch();

  useMount(() => {
    dispatch(closeNavbar());
  });
}
