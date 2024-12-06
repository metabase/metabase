import { action } from "@storybook/addon-actions";
import type { StoryFn } from "@storybook/react";
import type { ComponentProps } from "react";
import { Provider } from "react-redux";

import Modal from "metabase/components/Modal";
import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";
import { createMockUser } from "metabase-types/api/mocks";

import { CreateAlertModalContent } from "./CreateAlertModalContent";

export default {
  title: "Notifications/CreateAlertModalContent",
  component: CreateAlertModalContent,
  decorators: [ReduxDecorator],
};

function ReduxDecorator(Story: StoryFn) {
  const store = getStore(mainReducers, null, {
    currentUser: createMockUser(),
  });

  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
}

const Template: StoryFn<
  ComponentProps<typeof CreateAlertModalContent>
> = args => {
  return (
    <Modal isOpen>
      <CreateAlertModalContent {...args} />
    </Modal>
  );
};

export const Default = {
  render: Template,

  args: {
    onAlertCreated: action("onAlertCreated"),
    onCancel: action("onCancel"),
  },
};
