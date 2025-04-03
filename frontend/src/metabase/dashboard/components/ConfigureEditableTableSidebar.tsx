import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { datasetApi } from "metabase/api";
import { updateEditingDashboardCard } from "metabase/dashboard/actions";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { isQuestionCard } from "metabase/dashboard/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
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
  DashCardId,
  DashboardCard,
  StructuredDatasetQuery,
} from "metabase-types/api";

import { getDashCardById, getSidebar } from "../selectors";

interface ConfigureEditableTableSidebarProps {
  onUpdateDashCard: (dashcardId: DashCardId, card: Card) => void;
  onClose: () => void;
}

export function ConfigureEditableTableSidebar({
  onUpdateDashCard,
  onClose,
}: ConfigureEditableTableSidebarProps) {
  const dashcardId = useSelector(getSidebar).props.dashcardId;
  const dashcard = useSelector((state) => getDashCardById(state, dashcardId));

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
            <div>DashcardID: {dashcardId}</div>
            <ConfigureEditableTableColumns />
          </Tabs.Panel>
          <Tabs.Panel value="filters">
            <div>DashcardID: {dashcardId}</div>
            <ConfigureEditableTableFilters
              dashcard={dashcard}
              onUpdateDashCard={onUpdateDashCard}
            />
          </Tabs.Panel>
          <Tabs.Panel value="actions">
            <div>Not implemented</div>
          </Tabs.Panel>
        </Box>
      </Tabs>
    </Sidebar>
  );
}

function ConfigureEditableTableColumns() {
  return <div>Columns Content</div>;
}

function ConfigureEditableTableFilters({
  dashcard,
  onUpdateDashCard,
}: {
  dashcard: DashboardCard;
  onUpdateDashCard: (dashcardId: DashCardId, card: Card) => void;
}) {
  const [isOpened, { close, toggle }] = useDisclosure();

  const dispatch = useDispatch();

  const metadata = useSelector(getMetadata);

  // TODO: handle just added card.
  const initialQuery = useMemo(() => {
    const question = isQuestionCard(dashcard?.card)
      ? new Question(dashcard.card, metadata)
      : null;

    return question?.query();
  }, [dashcard?.card, metadata]);

  const [query, setQuery] = useState(initialQuery);

  const handleQueryChange = async (newQuery: Lib.Query) => {
    setQuery(newQuery);

    const legacyQuery = Lib.toLegacyQuery(newQuery);

    // NOTE: we cannot do data loading inside an action, as we don't support ad-hoc queries as a dashcard.
    // TODO: move this logic to FETCH_CARD_DATA action
    const action = dispatch(
      datasetApi.endpoints.getAdhocQuery.initiate(legacyQuery),
    );

    const cardData = await action.unwrap();

    const newCard: Card<StructuredDatasetQuery> = {
      ...dashcard.card,
      dataset_query: legacyQuery,
    };

    // setDashcardData(dashcard, cardData);
    dispatch(
      updateEditingDashboardCard({
        ...dashcard,
        card: newCard,
      }),
    );
  };

  if (!query) {
    return <div>ERROR: no query</div>;
  }

  return (
    <div>
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
    </div>
  );
}
