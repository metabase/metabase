import { useSelector } from "metabase/lib/redux";
import type { TransformNavBarProps } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";

import { TransformPicker } from "./TransformPicker";

export function TransformNavBar(_props: TransformNavBarProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  if (!isAdmin) {
    return null;
  }

  return <TransformPicker />;
}
