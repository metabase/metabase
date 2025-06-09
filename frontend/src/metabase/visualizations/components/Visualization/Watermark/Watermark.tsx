import { isVirtualDashCard } from "metabase/dashboard/utils";
import { getSubpathSafeUrl } from "metabase/lib/urls";
import type { BaseDashboardCard, Card } from "metabase-types/api";

import S from "./Watermark.module.css";

export const Watermark = ({ card }: { card: Card | BaseDashboardCard }) => {
  if (isVirtualDashCard(card)) {
    return null;
  }

  return (
    <div
      className={S.Root}
      data-testid="development-watermark"
      style={{
        backgroundImage: `url("${getSubpathSafeUrl("/app/assets/img/watermark-background.svg")}")`,
      }}
    />
  );
};
