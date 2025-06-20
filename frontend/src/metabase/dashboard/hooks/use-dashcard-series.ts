import { getIn } from "icepick";
import { useMemo } from "react";

import { DASHBOARD_SLOW_TIMEOUT } from "metabase/dashboard/constants";
import { getDashcardData, getSlowCards } from "metabase/dashboard/selectors";
import { isQuestionDashCard } from "metabase/dashboard/utils";
import { useSelector } from "metabase/lib/redux";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import type { Card, DashboardCard, VirtualCard } from "metabase-types/api";

export const useDashCardSeries = (dashcard: DashboardCard) => {
  const slowCards = useSelector(getSlowCards);

  const dashcardData = useSelector((state) =>
    getDashcardData(state, dashcard.id),
  );

  const mainCard: Card | VirtualCard = useMemo(
    () =>
      extendCardWithDashcardSettings(
        dashcard.card,
        dashcard.visualization_settings,
      ),
    [dashcard],
  );

  const cards = useMemo(() => {
    if (isQuestionDashCard(dashcard) && Array.isArray(dashcard.series)) {
      return [mainCard, ...dashcard.series];
    }
    return [mainCard];
  }, [mainCard, dashcard]);

  const series = useMemo(() => {
    return cards.map((card) => {
      const isSlow = card.id ? slowCards[card.id] : false;
      const isUsuallyFast =
        card.query_average_duration &&
        card.query_average_duration < DASHBOARD_SLOW_TIMEOUT;

      if (!card.id) {
        return { card, isSlow, isUsuallyFast };
      }

      return {
        ...getIn(dashcardData, [card.id]),
        card,
        isSlow,
        isUsuallyFast,
      };
    });
  }, [cards, dashcardData, slowCards]);

  return { mainCard, cards, series };
};
