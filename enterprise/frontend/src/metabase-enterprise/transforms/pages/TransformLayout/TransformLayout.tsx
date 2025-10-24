import type { ReactNode } from "react";

import { BenchLayout } from "metabase/bench/components/BenchLayout";
import * as Urls from "metabase/lib/urls";

import { TransformList } from "./TransformList";

type TransformLayoutParams = {
  transformId?: string;
};

type TransformLayoutProps = {
  params: TransformLayoutParams;
  children?: ReactNode;
};

export function TransformLayout({ params, children }: TransformLayoutProps) {
  const selectedId = Urls.extractEntityId(params.transformId);

  return (
    <BenchLayout
      nav={<TransformList selectedId={selectedId} />}
      name="transform"
    >
      {children}
    </BenchLayout>
  );
}
