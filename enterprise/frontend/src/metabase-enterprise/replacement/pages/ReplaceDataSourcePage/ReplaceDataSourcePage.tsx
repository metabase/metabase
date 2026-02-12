import type { Location } from "history";

import { parseParams } from "./utils";

type ReplaceDataSourcePageProps = {
  location: Location;
};

export function ReplaceDataSourcePage({
  location,
}: ReplaceDataSourcePageProps) {
  const _params = parseParams(location);
  return <div></div>;
}
