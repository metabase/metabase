import React from "react";
import _ from "underscore";
import { action } from "@storybook/addon-actions";
import { ComponentStory } from "@storybook/react";
import PinnedItemCard from "./PinnedItemCard";

export default {
  title: "Collections/PinnedItemCard",
  component: PinnedItemCard,
};

const onToggleSelected = action("onToggleSelected");
const onCopy = action("onCopy");
const onMove = action("onMove");

const Template: ComponentStory<typeof PinnedItemCard> = args => {
  return <PinnedItemCard {...args} />;
};

export const Question = Template.bind({});
Question.args = {
  collection: {
    can_write: true,
  },
  item: {
    id: 1,
    collection_position: 1,
    model: "card",
    name: "Question",
    description: "This is a description of the question",
    getIcon: () => ({ name: "question" }),
    getUrl: () => "/question/1",
    setArchived: action("setArchived"),
    copy: true,
    setCollection: true,
  },
  onToggleSelected,
  onCopy,
  onMove,
};

export const Dashboard = Template.bind({});
Dashboard.args = {
  collection: {
    can_write: true,
  },
  item: {
    id: 1,
    model: "dashboard",
    collection_position: 1,
    name: "Dashboard",
    description: Array(20)
      .fill("This is a description of the dashboard.")
      .join(" "),
    getIcon: () => ({ name: "dashboard" }),
    getUrl: () => "/dashboard/1",
    setArchived: action("setArchived"),
  },
  onToggleSelected,
  onCopy,
  onMove,
};

export const Model = Template.bind({});
Model.args = {
  collection: {
    can_write: true,
  },
  item: {
    id: 1,
    model: "dataset",
    collection_position: 1,
    name: "Model",
    description: "This is a description of the model",
    getIcon: () => ({ name: "model" }),
    getUrl: () => "/question/1",
    setArchived: action("setArchived"),
  },
  onToggleSelected,
  onCopy,
  onMove,
};
