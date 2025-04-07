import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { datasetApi } from "metabase/api";
import {
  setDashCardAttributes,
  setEditingDashcardData,
} from "metabase/dashboard/actions";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { isQuestionCard } from "metabase/dashboard/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { FilterPanelPopover } from "metabase/querying/filters/components/FilterPanel/FilterPanelPopover";
import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import { MultiStageFilterPicker } from "metabase/querying/filters/components/FilterPicker/MultiStageFilterPicker";
import { getMetadata } from "metabase/selectors/metadata";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Popover,
  Tabs,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  DashboardCard,
  StructuredDatasetQuery,
} from "metabase-types/api";

import { getDashCardById, getSidebar } from "../../selectors";

import { ConfigureEditableTableColumns } from "./ConfigureEditableTableColumns";

interface ConfigureEditableTableSidebarProps {
  onClose: () => void;
}

export function ConfigureEditableTableSidebar({
  onClose,
}: ConfigureEditableTableSidebarProps) {
  const dashcardId = useSelector(getSidebar).props.dashcardId;
  const dashcard = useSelector((state) =>
    dashcardId !== undefined ? getDashCardById(state, dashcardId) : undefined,
  );

  return (
    <Sidebar data-testid="add-table-sidebar">
      <Tabs defaultValue="columns">
        <Tabs.List px="md" pt="sm">
          <Tabs.Tab value="columns">{t`Columns`}</Tabs.Tab>
          <Tabs.Tab value="filters">{t`Filters`}</Tabs.Tab>
          <Tabs.Tab value="actions">{t`Actions`}</Tabs.Tab>

          <Flex flex="1" justify="flex-end" align="center">
            <ActionIcon onClick={onClose}>
              <Icon name="close" />
            </ActionIcon>
          </Flex>
        </Tabs.List>

        <Box p="md">
          <Tabs.Panel value="columns">
            {dashcard && <ConfigureEditableTableColumns dashcard={dashcard} />}
          </Tabs.Panel>
          <Tabs.Panel value="filters">
            <div>DashcardID: {dashcardId}</div>
            <ConfigureEditableTableFilters dashcard={dashcard} />
          </Tabs.Panel>
          <Tabs.Panel value="actions">
            <div>Not implemented</div>
          </Tabs.Panel>
        </Box>
      </Tabs>
    </Sidebar>
  );
}

function ConfigureEditableTableFilters({
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

  const filterItems = useMemo(() => getFilterItems(query), [query]);

  const handleQueryChange = async (newQuery: Lib.Query) => {
    const legacyQuery = Lib.toLegacyQuery(newQuery);

    // NOTE: we cannot do data loading inside an action, as we don't support ad-hoc queries as a dashcard
    const action = dispatch(
      // TODO: set "dashboard" context for api request ?
      datasetApi.endpoints.getAdhocQuery.initiate(legacyQuery),
    );
    const cardData = await action.unwrap();

    const newCard: Card<StructuredDatasetQuery> = {
      ...card,
      dataset_query: legacyQuery,
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
          <Button
            leftSection={<Icon name="add" />}
            onClick={toggle}
            data-testid="question-filter-header"
          >
            {t`Add a filter`}
          </Button>
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
