import React, { useState } from "react";
import {
  CollectionBrowser,
  InteractiveDashboard,
  InteractiveQuestion,
  type MetabaseCollectionItem,
} from "@metabase/embedding-sdk-react";

export default function BrowseAndOpen() {
  const [dashboardId, setDashboardId] = useState<number | null>(null);
  const [questionId, setQuestionId] = useState<number | null>(null);

  const handleClick = (item: MetabaseCollectionItem) => {
    // Metabase's internal names for these differ from what people see:
    // a question is a "card", and a model is a "dataset".
    if (item.model === "dashboard") {
      setDashboardId(item.id as number);
    } else if (item.model === "card" || item.model === "dataset") {
      setQuestionId(item.id as number);
    }
  };

  if (dashboardId) {
    return <InteractiveDashboard dashboardId={dashboardId} />;
  }

  if (questionId) {
    return <InteractiveQuestion questionId={questionId} />;
  }

  return <CollectionBrowser collectionId="personal" onClick={handleClick} />;
}
