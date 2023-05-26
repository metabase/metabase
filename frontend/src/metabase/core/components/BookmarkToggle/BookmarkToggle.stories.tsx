import React from "react";
import type { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import BookmarkToggle from "./BookmarkToggle";

export default {
  title: "Core/BookmarkToggle",
  component: BookmarkToggle,
};

const Template: ComponentStory<typeof BookmarkToggle> = args => {
  const [{ isBookmarked }, updateArgs] = useArgs();
  const handleCreateBookmark = () => updateArgs({ isBookmarked: true });
  const handleDeleteBookmark = () => updateArgs({ isBookmarked: false });

  return (
    <BookmarkToggle
      {...args}
      isBookmarked={isBookmarked}
      onCreateBookmark={handleCreateBookmark}
      onDeleteBookmark={handleDeleteBookmark}
    />
  );
};

export const Default = Template.bind({});
Default.args = {
  isBookmarked: false,
};
