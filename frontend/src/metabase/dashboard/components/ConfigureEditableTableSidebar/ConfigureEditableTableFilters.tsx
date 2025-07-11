import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { updateEditableTableCardQueryInEditMode } from "metabase/dashboard/actions";
import { isQuestionCard } from "metabase/dashboard/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Flex, Icon, Popover } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { Card, DashboardCard } from "metabase-types/api";

import S from "./ConfigureEditableTableFilters.module.css";
import { FilterItem } from "./FilterItem";

export function ConfigureEditableTableFilters({
  dashcard,
}: {
  dashcard: DashboardCard;
}) {
  const [isOpened, { close, toggle }] = useDisclosure();
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const card = dashcard.card as Card; // this component is only used for editable table card, which is always a Card

  const query = useMemo(() => {
    const question = isQuestionCard(card) ? new Question(card, metadata) : null;

    return question?.query();
  }, [card, metadata]);

  const filterItems = useMemo(
    () => (query ? getFilterItems(query) : []),
    [query],
  );

  const hasFilters = filterItems.length > 0;

  const handleQueryChange = async (newQuery: Lib.Query) => {
    const legacyQuery = Lib.toLegacyQuery(newQuery);

    const cardId = card.id;

    if (cardId) {
      dispatch(
        updateEditableTableCardQueryInEditMode({
          dashcardId: dashcard.id,
          cardId: cardId,
          newCard: {
            ...card,
            id: cardId,
            dataset_query: legacyQuery,
          },
        }),
      );
    }
  };

  if (!query) {
    return <div>{t`ERROR: no query`}</div>;
  }

  return (
    <Flex className={S.filtersContainer} align="center" wrap="wrap" gap="sm">
      {filterItems.map(({ filter, filterIndex, stageIndex }, itemIndex) => (
        <FilterItem
          key={itemIndex}
          query={query}
          stageIndex={stageIndex}
          filter={filter}
          filterIndex={filterIndex}
          onChange={handleQueryChange}
        />
      ))}

      <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
        <Popover.Target>
          {hasFilters ? (
            <Button
              variant="filled"
              color="filter"
              leftSection={<Icon name="add" />}
              onClick={toggle}
            />
          ) : (
            <Button
              variant="outline"
              color="filter"
              onClick={toggle}
            >{t`Add filters to filter your table`}</Button>
          )}
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
    </Flex>
  );
}
