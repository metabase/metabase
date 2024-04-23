import type { Path } from "history";

import type { User } from "metabase-types/api";

export type AccountHeaderProps = {
  user: User;
  path?: string;
  onChangeLocation?: (nextLocation: Path) => void;
};
