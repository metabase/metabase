import { action } from "@storybook/addon-actions";
import type { ComponentStory } from "@storybook/react";

import PinnedItemCard from "./PinnedItemCard";

export default {
  title: "Collections/PinnedItemCard",
  component: PinnedItemCard,
};

const collection = {
  can_write: true,
  id: 1,
  name: "Collection Foo",
  description: null,
  archived: false,
  location: "/",
};

const onCopy = action("onCopy");
const onMove = action("onMove");

const Template: ComponentStory<typeof PinnedItemCard> = args => {
  return <PinnedItemCard {...args} />;
};

export const Question = Template.bind({});
Question.args = {
  collection,
  item: {
    id: 1,
    collection_position: 1,
    collection_id: null,
    model: "card",
    name: "Question",
    description: "This is a description of the question",
    getIcon: () => ({ name: "question" }),
    getUrl: () => "/question/1",
    setArchived: action("setArchived"),
    setPinned: action("setPinned"),
    copy: true,
    setCollection: action("setCollection"),
  },
  onCopy,
  onMove,
};

export const Dashboard = Template.bind({});
Dashboard.args = {
  collection,
  item: {
    id: 1,
    model: "dashboard",
    collection_position: 1,
    collection_id: null,
    name: "Dashboard",
    description: Array(20)
      .fill("This is a description of the dashboard.")
      .join(" "),
    getIcon: () => ({ name: "dashboard" }),
    getUrl: () => "/dashboard/1",
    setArchived: action("setArchived"),
    setPinned: action("setPinned"),
  },
  onCopy,
  onMove,
};

export const Model = Template.bind({});
Model.args = {
  collection,
  item: {
    id: 1,
    model: "dataset",
    collection_position: 1,
    collection_id: null,
    name: "Model",
    description: "This is a description of the model",
    getIcon: () => ({ name: "model" }),
    getUrl: () => "/question/1",
    setArchived: action("setArchived"),
    setPinned: action("setPinned"),
  },
  onCopy,
  onMove,
};
