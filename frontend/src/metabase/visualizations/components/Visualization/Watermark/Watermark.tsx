import { isVirtualDashCard } from "metabase/dashboard/utils";
import type { BaseDashboardCard, Card } from "metabase-types/api";

import S from "./Watermark.module.css";
import watermark from "./watermark.svg";

export const Watermark = ({ card }: { card: Card | BaseDashboardCard }) => {
  if (isVirtualDashCard(card)) {
    return null;
  }

  return (
    <div
      className={S.Root}
      data-testid="development-watermark"
      style={{ backgroundImage: `url(${watermark})` }}
    />
  );
};
