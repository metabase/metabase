import { t } from "ttag";

import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { useSelector } from "metabase/lib/redux";
import { ActionIcon, Box, Flex, Icon, Tabs } from "metabase/ui";

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
            <ConfigureEditableTableFilters />
          </Tabs.Panel>
          <Tabs.Panel value="actions">
            <div>Not implemented</div>
          </Tabs.Panel>
        </Box>
      </Tabs>
    </Sidebar>
  );
}

function ConfigureEditableTableFilters() {
  return <div>Filters Content</div>;
}
