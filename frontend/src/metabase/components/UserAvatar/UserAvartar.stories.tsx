import type { ComponentStory } from "@storybook/react";

import UserAvatar from "./UserAvatar";

export default {
  title: "Components/UserAvatar",
  component: UserAvatar,
};

const Template: ComponentStory<typeof UserAvatar> = args => (
  <UserAvatar {...args} />
);

export const Default = Template.bind({});
Default.args = {
  user: {
    first_name: "Testy",
    last_name: "Tableton",
    email: "user@metabase.test",
    common_name: "Testy Tableton",
  },
};

export const SingleName = Template.bind({});
SingleName.args = {
  user: {
    first_name: "Testy",
    last_name: null,
    email: "user@metabase.test",
    common_name: "Testy",
  },
};

export const OnlyEmail = Template.bind({});
OnlyEmail.args = {
  user: {
    first_name: null,
    last_name: null,
    email: "user@metabase.test",
    common_name: "user@metabase.test",
  },
};

export const ShortEmail = Template.bind({});
ShortEmail.args = {
  user: {
    first_name: null,
    last_name: null,
    email: "u@metabase.test",
    common_name: "u@metabase.test",
  },
};
