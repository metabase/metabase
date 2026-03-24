import { useMount } from "react-use";

import { useDispatch } from "metabase/utils/redux";
import { closeNavbar } from "metabase/redux/app";

export function useCloseNavbarOnMount() {
  const dispatch = useDispatch();

  useMount(() => {
    dispatch(closeNavbar());
  });
}
