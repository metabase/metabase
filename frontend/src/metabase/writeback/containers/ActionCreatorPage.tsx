import React from "react";

import { ActionCreator } from "metabase/writeback/components/ActionCreator";

interface PageProps {
  params: {
    actionId?: string;
  };
}

export default function ActionCreatorPage({ params: { actionId } }: PageProps) {
  return <ActionCreator actionId={actionId} />;
}
