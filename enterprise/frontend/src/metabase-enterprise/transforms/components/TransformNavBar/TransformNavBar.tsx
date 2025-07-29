import { useSelector } from "metabase/lib/redux";
import type { TransformNavBarProps } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";

export function TransformNavBar({ isActive }: TransformNavBarProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  if (!isAdmin) {
    return null;
  }

  return <TransformList isActive={isActive} />;
}

type TransformListProps = {
  isActive: boolean;
};

function TransformList({ isActive }: TransformListProps) {
  return <TransformToggle isActive={isActive} />;
}

type TransformToggleProps = {
  isActive: boolean;
};

function TransformToggle(_props: TransformToggleProps) {
  return null;
}
