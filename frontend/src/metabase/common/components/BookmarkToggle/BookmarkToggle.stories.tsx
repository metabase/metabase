import type { StoryFn } from "@storybook/react-webpack5";
import { useArgs } from "storybook/preview-api";

import { BookmarkToggle } from "./BookmarkToggle";

export default {
  title: "Components/BookmarkToggle",
  component: BookmarkToggle,
};

const Template: StoryFn<typeof BookmarkToggle> = (args) => {
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

export const Default = {
  render: Template,

  args: {
    isBookmarked: false,
  },
};
