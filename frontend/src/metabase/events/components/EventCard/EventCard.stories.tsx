import React from "react";
import { ComponentStory } from "@storybook/react";
import EventCard from "./EventCard";
import { createMockEvent } from "metabase-types/api/mocks";

export default {
  title: "Events/EventCard",
  component: EventCard,
};

const Template: ComponentStory<typeof EventCard> = args => {
  return <EventCard {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  event: createMockEvent(),
};
