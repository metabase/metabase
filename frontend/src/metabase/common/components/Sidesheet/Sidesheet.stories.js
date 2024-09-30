import { Flex } from "metabase/ui";

import { Sidesheet } from "./Sidesheet";
import { TestPagedSidesheet, TestTabbedSidesheet } from "./Sidesheet.samples";
import { SidesheetButton, SidesheetButtonWithChevron } from "./SidesheetButton";
import { SidesheetCard } from "./SidesheetCard";
import { SidesheetCardSection } from "./SidesheetCardSection";

const args = {
  size: "md",
  title: "My Awesome Sidesheet",
  onClose: () => {},
  isOpen: true,
};

const argTypes = {
  size: {
    options: ["xs", "sm", "md", "lg", "xl", "auto"],
    control: { type: "inline-radio" },
  },
  title: {
    control: { type: "text" },
  },
  isOpen: {
    control: { type: "boolean" },
  },
};

const DefaultTemplate = args => (
  <Sidesheet {...args}>Call me Ishmael ...</Sidesheet>
);

const WithCardsTemplate = args => (
  <Sidesheet {...args}>
    <SidesheetCard>Here is even more cool information</SidesheetCard>
    <SidesheetCard title="Some information has a title">
      titles are neat
    </SidesheetCard>
  </Sidesheet>
);

const WithSectionedCardsTemplate = args => (
  <Sidesheet {...args}>
    <SidesheetCard>
      <SidesheetCardSection title="lots">
        Some cards have so much information
      </SidesheetCardSection>
      <SidesheetCardSection title="of information">
        that you need a bunch
      </SidesheetCardSection>
      <SidesheetCardSection title="to display">
        of sections to display it all
      </SidesheetCardSection>
    </SidesheetCard>
  </Sidesheet>
);

const PagedSidesheetTemplate = () => <TestPagedSidesheet />;

const TabbedSidesheetTemplate = () => <TestTabbedSidesheet />;

const SidesheetButtonTemplate = () => (
  <Flex maw="30rem" direction="column" gap="lg">
    <SidesheetCard title="normal">
      <SidesheetButton>Do something fun</SidesheetButton>
    </SidesheetCard>
    <SidesheetCard title="with chevron">
      <Flex justify="space-between">
        Favorite Pokemon
        <SidesheetButtonWithChevron>Naclstack</SidesheetButtonWithChevron>
      </Flex>
    </SidesheetCard>
    <SidesheetCard title="with chevron - fullWidth">
      <SidesheetButtonWithChevron fullWidth>
        Configure favorite pokemon
      </SidesheetButtonWithChevron>
    </SidesheetCard>
  </Flex>
);

export default {
  title: "Components/Sidesheet",
  component: Sidesheet,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
  name: "Default",
};

export const WithCards = {
  render: WithCardsTemplate,
  name: "With cards",
};

export const WithSectionedCards = {
  render: WithSectionedCardsTemplate,
  name: "With sectioned cards",
};

export const WithSubPages = {
  render: PagedSidesheetTemplate,
  name: "With sub pages",
};

export const WithTabs = {
  render: TabbedSidesheetTemplate,
  name: "With tabs",
};

export const SidesheetButtons = {
  render: SidesheetButtonTemplate,
  name: "Sidesheet buttons",
};
