import type { Location } from "history";

import { PageHeader } from "./PageHeader";
import { parseParams } from "./utils";

type ReplaceDataSourcePageProps = {
  location: Location;
};

export function ReplaceDataSourcePage({
  location,
}: ReplaceDataSourcePageProps) {
  const params = parseParams(location);

  return (
    <div>
      <PageHeader source={params.source} target={params.target} />
    </div>
  );
}
