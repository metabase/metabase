import { UserAvatar } from "./UserAvatar";

export default {
  title: "Components/UserAvatar",
  component: UserAvatar,
};

export const Default = {
  args: {
    user: {
      first_name: "Testy",
      last_name: "Tableton",
      email: "user@metabase.test",
      common_name: "Testy Tableton",
    },
  },
};

export const SingleName = {
  args: {
    user: {
      first_name: "Testy",
      last_name: null,
      email: "user@metabase.test",
      common_name: "Testy",
    },
  },
};

export const OnlyEmail = {
  args: {
    user: {
      first_name: null,
      last_name: null,
      email: "user@metabase.test",
      common_name: "user@metabase.test",
    },
  },
};

export const ShortEmail = {
  args: {
    user: {
      first_name: null,
      last_name: null,
      email: "u@metabase.test",
      common_name: "u@metabase.test",
    },
  },
};
