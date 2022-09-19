import React from "react";

import type Question from "metabase-lib/lib/Question";

interface Props {
  model: Question;
}

function ModelDetailPage({ model }: Props) {
  return <span>{model.displayName()}</span>;
}

export default ModelDetailPage;
