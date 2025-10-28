import { type ReactNode, useState } from "react";

import { BenchLayout } from "metabase/bench/components/BenchLayout";
import * as Urls from "metabase/lib/urls";

import { TransformMoreMenuModal } from "../../components/TransformMoreMenu";
import type { TransformMoreMenuModalState } from "../../types";

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
  const [modal, setModal] = useState<TransformMoreMenuModalState>();

  return (
    <>
      <BenchLayout
        nav={<TransformList selectedId={selectedId} onOpenModal={setModal} />}
        name="transform"
      >
        {children}
      </BenchLayout>
      {modal != null && (
        <TransformMoreMenuModal
          modal={modal}
          onClose={() => setModal(undefined)}
        />
      )}
    </>
  );
}
