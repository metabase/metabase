import { useState } from "react";
import { useMount } from "react-use";

import { Sidesheet, SidesheetCard } from "metabase/common/components/Sidesheet";
import { SidesheetCardSection } from "metabase/common/components/Sidesheet/SidesheetCardSection";
import SideSheetStyles from "metabase/common/components/Sidesheet/sidesheet.module.css";
import { Flex, Icon, Stack, Switch, Tabs } from "metabase/ui";

import { SidesheetButtonWithChevron } from "./SidesheetButton";
import { SidesheetSubPage } from "./SidesheetSubPage";
import { SidesheetTabPanelContainer } from "./SidesheetTabPanelContainer";

export const TestTabbedSidesheet = () => {
  const [isSheetOpen, setIsSheetOpen] = useState(true);

  return (
    <Sidesheet
      title="My side sheet"
      isOpen={isSheetOpen}
      onClose={() => setIsSheetOpen(false)}
      removeBodyPadding
    >
      <Tabs defaultValue="two" className={SideSheetStyles.FlexScrollContainer}>
        <Tabs.List mx="lg">
          <Tabs.Tab value="one">One</Tabs.Tab>
          <Tabs.Tab value="two">Two</Tabs.Tab>
          <Tabs.Tab value="three">Three</Tabs.Tab>
        </Tabs.List>
        <SidesheetTabPanelContainer>
          <Tabs.Panel value="one">
            <SidesheetCard>Tab 1 content</SidesheetCard>
          </Tabs.Panel>
          <Tabs.Panel value="two" h="100%">
            <Stack gap="lg">
              <SidesheetCard title="Sidesheets with tabs">
                Lots of side sheets have tabs, which can be tricky to set up to
                handle scrolling properly. Fortunately, there are a couple
                helper components that make this easy.
              </SidesheetCard>
              <SidesheetCard title="SidesheetTabPanelContainer">
                <p>
                  Wrap all your tab panels in{" "}
                  <code>SidesheetTabPanelContainer</code> to get them scrolling
                  internally so that the tabs remain visible at all times.
                </p>
              </SidesheetCard>

              <SidesheetCard title="removeBodyPadding prop">
                <p>
                  You&apos;ll need to pass the{" "}
                  <code>removeBodyPadding prop</code> to any sidesheet with tabs
                  so that you can keep the scrollbar on the outer container when
                  you have tabs.
                </p>
              </SidesheetCard>
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="three">
            <SidesheetCard>Tab 3 content</SidesheetCard>
          </Tabs.Panel>
        </SidesheetTabPanelContainer>
      </Tabs>
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
