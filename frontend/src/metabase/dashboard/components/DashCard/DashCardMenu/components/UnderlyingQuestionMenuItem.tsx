import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useDashboardContext } from "metabase/dashboard/context";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { Icon, Menu } from "metabase/ui";
import { isVisualizerDashboardCard } from "metabase/visualizer/utils";
import type { CardId, SingleSeries } from "metabase-types/api";

import { useDashCardSeries } from "../../DashCard";
import type { UseDashcardMenuItemsProps } from "../types";

export const UnderlyingQuestionMenuItem = ({
  series,
  dashcard,
}: Pick<UseDashcardMenuItemsProps, "series" | "dashcard">) => {
  const { navigateToNewCardFromDashboard } = useDashboardContext();

  const { series: untranslatedRawSeries } = useDashCardSeries(dashcard);

  const rawSeries = PLUGIN_CONTENT_TRANSLATION.useTranslateSeries(
    untranslatedRawSeries,
  );

  const findCardById = useCallback(
    (cardId?: CardId | null) => {
      const lookupSeries = isVisualizerDashboardCard(dashcard)
        ? rawSeries
        : series;
      return (
        lookupSeries.find((series: SingleSeries) => series.card.id === cardId)
          ?.card ?? lookupSeries[0].card
      );
    },
    [rawSeries, dashcard, series],
  );

  const onOpenQuestion = useCallback(
    (cardId: CardId | null) => {
      const card = findCardById(cardId);
      navigateToNewCardFromDashboard?.({
        previousCard: findCardById(card?.id),
        nextCard: card,
        dashcard,
      });
    },
    [dashcard, findCardById, navigateToNewCardFromDashboard],
  );

  const titleMenuItems = useMemo(
    () =>
      rawSeries.map((series, index) => (
        <Menu.Item
          key={index}
          onClick={() => {
            onOpenQuestion(series.card.id);
          }}
        >
          {series.card.name}
        </Menu.Item>
      )),
    [rawSeries, onOpenQuestion],
  );

  return (
    <Menu trigger="click-hover" position="right">
      <Menu.Target>
        <Menu.Item
          styles={{
            // styles needed to override the hover styles
            // as hovering is bugged for submenus
            // this'll be much better in v8
            item: {
              backgroundColor: "transparent",
              color: "var(--mb-color-text-primary)",
            },
            itemSection: {
              color: "var(--mb-color-text-primary)",
            },
          }}
          leftSection={<Icon name="external" aria-hidden />}
          rightSection={<Icon name="chevronright" aria-hidden />}
        >
          {t`View question(s)`}
        </Menu.Item>
      </Menu.Target>
      <Menu.Dropdown data-testid="dashcard-menu-open-underlying-question">
        {titleMenuItems}
      </Menu.Dropdown>
    </Menu>
  );
};
