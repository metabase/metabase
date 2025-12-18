import { isVirtualDashCard } from "metabase/dashboard/utils";
import type { BaseDashboardCard, Card } from "metabase-types/api";

import S from "./Watermark.module.css";

export const Watermark = ({ card }: { card: Card | BaseDashboardCard }) => {
  if (isVirtualDashCard(card)) {
    return null;
  }

  return (
    <div className={S.Root} data-testid="development-watermark">
      <svg height="100%" width="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id="text"
            x="0"
            y="0"
            height="350"
            width="350"
            patternUnits="userSpaceOnUse"
          >
            <text
              x="0"
              y="0"
              fontSize="70"
              fontWeight="700"
              transform="translate(35, 330) rotate(-45)"
              textAnchor="start"
              className={S.text}
            >
              {"Development"}
            </text>
          </pattern>
        </defs>
        <rect opacity=".2" height="100%" width="100%" fill="url(#text)" />
      </svg>
    </div>
  );
};
