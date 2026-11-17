/* eslint-disable i18next/no-literal-string */
import { useState } from "react";
import { useMount } from "react-use";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  SIDESHEET_HORIZONTAL_PADDING,
  Sidesheet,
  SidesheetCard,
} from "metabase/common/components/Sidesheet";
import { SidesheetCardSection } from "metabase/common/components/Sidesheet/SidesheetCardSection";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "metabase/ui";

import { SidesheetButtonWithChevron } from "./SidesheetButton";
import { SidesheetSubPage } from "./SidesheetSubPage";

export const TestSectionedSidesheet = () => {
  const [isSheetOpen, setIsSheetOpen] = useState(true);

  return (
    <Sidesheet
      title="Info"
      titleSize="h3"
      isOpen={isSheetOpen}
      onClose={() => setIsSheetOpen(false)}
      actions={
        <Tooltip label="Insights">
          <ActionIcon
            variant="subtle"
            size="md"
            c="text-primary"
            aria-label="Insights"
          >
            <Icon name="insight" />
          </ActionIcon>
        </Tooltip>
      }
      footer={
        <Box
          px={SIDESHEET_HORIZONTAL_PADDING}
          py="md"
          bg="background_page-secondary"
        >
          <Text c="text-secondary" size="sm">
            Pinned below the scrolling body: entity IDs, for one.
          </Text>
        </Box>
      }
    >
      <Stack gap="xxl">
        <SidebarSection title="Description">
          <Text>
            Info panels are one scrolling column of titled sections. Each
            section is a <code>SidebarSection</code>.
          </Text>
        </SidebarSection>
        <SidebarSection title="Details">
          <DetailsTable>
            <DetailsRow label="Created" value="March 3, 2024 by Ishmael" />
            <DetailsRow label="Last edited" value="Yesterday by Queequeg" />
            <DetailsRow label="Saved in" value="Whaling" />
          </DetailsTable>
        </SidebarSection>
        <SidebarSection title="Header actions">
          <Text>
            The <code>actions</code> prop renders icon buttons before the close
            button, and <code>footer</code> pins content below the body.
          </Text>
        </SidebarSection>
      </Stack>
    </Sidesheet>
  );
};

export const TestPagedSidesheet = () => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [page, setPage] = useState("main");

  useMount(() => setIsSheetOpen(true));

  if (page === "sub") {
    return (
      <SidesheetSubPage
        title="More Settings"
        isOpen={isSheetOpen}
        onBack={() => setPage("main")}
        onClose={() => setIsSheetOpen(false)}
      >
        <SidesheetCard title="My Section Title">
          look at all these settings
          <Switch label="my cool setting" />
          <Switch label="my other setting" />
        </SidesheetCard>
      </SidesheetSubPage>
    );
  }

  return (
    <Sidesheet
      title="My side sheet"
      isOpen={isSheetOpen}
      onClose={() => setIsSheetOpen(false)}
    >
      <SidesheetCard title="Sidesheets can have subpages">
        <p>
          Subpages are really just a whole other sidesheet with a title with a
          back chevron. but there&apos;s a handy <code>SidesheetSubPage</code>{" "}
          component you can use to make sure the UI is consistent across
          subpages
        </p>
      </SidesheetCard>
      <SidesheetCard title="Here's an example">
        Here&apos;s some information about a cool feature that you can configure
        in a subpage.
        <SidesheetButtonWithChevron
          fullWidth
          onClick={() => setPage("sub")}
          leftSection={<Icon name="gear" />}
        >
          More Settings in a full width button
        </SidesheetButtonWithChevron>
        <Flex justify="space-between">
          <label>More Settings Label</label>
          <SidesheetButtonWithChevron onClick={() => setPage("sub")}>
            Active
          </SidesheetButtonWithChevron>
        </Flex>
      </SidesheetCard>
      <SidesheetCard>
        stuff without a title
        <SidesheetCardSection>section stuff</SidesheetCardSection>
      </SidesheetCard>

      <SidesheetCard>
        stuff without a title
        <SidesheetCardSection>section stuff</SidesheetCardSection>
        <SidesheetCardSection title="another section">
          more stuff
        </SidesheetCardSection>
      </SidesheetCard>

      <SidesheetCard>
        stuff without a title
        <SidesheetCardSection>section stuff</SidesheetCardSection>
        <SidesheetCardSection title="another section">
          more stuff
        </SidesheetCardSection>
      </SidesheetCard>
    </Sidesheet>
  );
};
