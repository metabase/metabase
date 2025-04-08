import { setupTaskEndpoint } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { createMockTask } from "metabase-types/api/mocks";

import { TaskModal } from "./TaskModal";

const TASK = createMockTask({
  task_details: {
    useful: {
      information: true,
    },
  },
});

const FORMATTED_TASK_DETAILS_JSON = JSON.stringify(TASK.task_details, null, 2);

const setup = async () => {
  setupTaskEndpoint(TASK);

  renderWithProviders(<TaskModal params={{ taskId: TASK.id }} />);

  await waitForLoaderToBeRemoved();
};

describe("TaskModal", () => {
  it("shows formatted task details", async () => {
    await setup();

    const textarea = await screen.findByRole("textbox");
    expect(textarea).toHaveValue(FORMATTED_TASK_DETAILS_JSON);
  });
});
