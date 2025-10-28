import type React from "react";

import { BenchLayout } from "metabase/bench/components/BenchLayout";
import { TableOrModelTree } from "metabase/metadata/pages/DataModel/components/TableOrModelTree";
import type { RouteParams } from "metabase/metadata/pages/DataModel/types";

export const MetadataLayout = ({
  children,
  params,
}: {
  children: React.ReactNode;
  params: RouteParams;
}) => {
  return (
    <BenchLayout name="metadata" nav={<TableOrModelTree params={params} />}>
      {children}
    </BenchLayout>
  );
};
