import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";

import { datasetApi } from "metabase/api";
import {
  setDashCardAttributes,
  setEditingDashcardData,
} from "metabase/dashboard/actions";
import { isQuestionCard } from "metabase/dashboard/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { FilterPanelPopover } from "metabase/querying/filters/components/FilterPanel/FilterPanelPopover";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import { getMetadata } from "metabase/selectors/metadata";
import { ActionIcon, Box, Flex, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card, DashboardCard } from "metabase-types/api";

export function ConfigureEditableTableFilters({
  dashcard,
}: {
  dashcard: DashboardCard;
}) {
  const [isOpened, { close, toggle }] = useDisclosure();
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const card = dashcard.card;

  // TODO: check just added card
  const query = useMemo(() => {
    const question = isQuestionCard(card) ? new Question(card, metadata) : null;

    return question?.query();
  }, [card, metadata]);

  const filterItems = useMemo(
    () => (query ? getFilterItems(query) : []),
    [query],
  );

  const handleQueryChange = async (newQuery: Lib.Query) => {
    const legacyQuery = Lib.toLegacyQuery(newQuery);

    // set data override to null to show loading state
    dispatch(setEditingDashcardData(dashcard.id, card.id, null));

    // NOTE: we cannot do data loading inside an action, as we don't support ad-hoc queries as a dashcard
    const action = dispatch(
      // TODO: set "dashboard" context for api request ?
      datasetApi.endpoints.getAdhocQuery.initiate(legacyQuery),
    );
    const cardData = await action.unwrap();

    const newCard: Card = {
      ...card,
      dataset_query: legacyQuery,

      // @ts-expect-error - we don't have a type for Store card with additional state
      isDirty: true,
    };

    dispatch(
      setDashCardAttributes({
        id: dashcard.id,
        attributes: {
          card: newCard,
        },
      }),
    );
    dispatch(setEditingDashcardData(dashcard.id, card.id, cardData));
  };

  if (!query) {
    return <div>ERROR: no query</div>;
  }

  return (
    <Box>
      <Flex align="center" wrap="wrap" gap="sm" py="sm">
        {filterItems.map(({ filter, filterIndex, stageIndex }, itemIndex) => (
          <FilterPanelPopover
            key={itemIndex}
            query={query}
            stageIndex={stageIndex}
            filter={filter}
            filterIndex={filterIndex}
            onChange={handleQueryChange}
          />
        ))}
      </Flex>
      <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
        <Popover.Target>
          <ActionIcon
            bg="color-mix(in srgb, var(--mb-color-filter) 20%, transparent)"
            onClick={toggle}
          >
            <Icon c="var(--mb-color-filter)" name="add" />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <MultiStageFilterPicker
            query={query}
            canAppendStage={false}
            onChange={handleQueryChange}
            onClose={close}
          />
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}
