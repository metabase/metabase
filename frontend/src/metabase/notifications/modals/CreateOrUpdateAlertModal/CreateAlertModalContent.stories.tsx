import { action } from "@storybook/addon-actions";
import type { StoryFn } from "@storybook/react";
import { type ComponentProps, useState } from "react";
import { Provider } from "react-redux";

import { createMockEntitiesState } from "__support__/store";
import Modal from "metabase/components/Modal";
import api from "metabase/lib/api";
import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";
import {
  createMockCard,
  createMockDataset,
  createMockUser,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockQueryBuilderState } from "metabase-types/store/mocks";

import { CreateAlertModalContent } from "./CreateAlertModalContent";

export default {
  title: "Notifications/CreateAlertModalContent",
  component: CreateAlertModalContent,
  decorators: [ReduxDecorator],
};

function ReduxDecorator(Story: StoryFn) {
  const mockCard = createMockCard({
    display: "line",
    visualization_settings: createMockVisualizationSettings({
      "graph.show_goal": true,
      "graph.metrics": ["count"],
    }),
  });

  const queryResult = createMockDataset();

  const store = getStore(mainReducers, null, {
    currentUser: createMockUser(),
    qb: createMockQueryBuilderState({
      card: mockCard,
    }),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [mockCard],
    }),
    queryResults: [queryResult],
  });

  api.basename = "http://localhost:3000";
  api.apiKey = "mb_2dvGh4fpTtSzWyXqSuZ7NyaCDcjshvesCdiIYUGsQGY=";

  return (
    <Provider store={store}>
      <Story />
    </Provider>
  );
}

const Template: StoryFn<
  ComponentProps<typeof CreateAlertModalContent>
> = args => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
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
