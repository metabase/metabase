import { action } from "@storybook/addon-actions";
import type { StoryFn } from "@storybook/react";

import PinnedItemCard, { type PinnedItemCardProps } from "./PinnedItemCard";

export default {
  title: "App/Collections/PinnedItemCard",
  component: PinnedItemCard,
};

const collection = {
  can_write: true,
  id: 1,
  name: "Collection Foo",
  description: null,
  archived: false,
  can_restore: false,
  can_delete: false,
  location: "/",
};

const onCopy = action("onCopy");
const onMove = action("onMove");

const Template: StoryFn<PinnedItemCardProps> = (args) => {
  return <PinnedItemCard {...args} />;
};

export const Question = {
  render: Template,

  args: {
    collection,
    item: {
      id: 1,
      collection_position: 1,
      collection_id: null,
      model: "card",
      name: "Question",
      description: "This is a description of the question",
      setArchived: action("setArchived"),
      setPinned: action("setPinned"),
      copy: true,
      setCollection: action("setCollection"),
      archived: false,
    },
    onCopy,
    onMove,
  },
};

export const Dashboard = {
  render: Template,

  args: {
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
      setArchived: action("setArchived"),
      setPinned: action("setPinned"),
      archived: false,
    },
    onCopy,
    onMove,
  },
};

export const Model = {
  render: Template,

  args: {
    collection,
    item: {
      id: 1,
      model: "dataset",
      collection_position: 1,
      collection_id: null,
      name: "Model",
      description: "This is a description of the model",
      setArchived: action("setArchived"),
      setPinned: action("setPinned"),
      archived: false,
    },
    onCopy,
    onMove,
  },
};
