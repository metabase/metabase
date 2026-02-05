import { t } from "ttag";

import { TransformsPurchasePage } from "./TransformsPurchasePage";

export function TransformsUpsellPage() {
  const bulletPoints = [
    t`Schedule and run transforms as groups with jobs`,
    t`Fast runs with incremental transforms that respond to data changes`,
    t`Predictable costs -  72,000 successful transform runs included every month`,
    t`If you go over your cap, transforms bill at 0.01 per transform run`,
  ];

  return <TransformsPurchasePage bulletPoints={bulletPoints} />;
}
