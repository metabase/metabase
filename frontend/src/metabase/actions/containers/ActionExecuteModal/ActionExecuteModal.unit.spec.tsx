import fetchMock from "fetch-mock";

import { setupActionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { ActionsApi } from "metabase/services";
import {
  createMockActionParameter,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";

import type { ActionExecuteModalProps } from "./ActionExecuteModal";
import { ActionExecuteModal } from "./ActionExecuteModal";

const parameter1 = createMockActionParameter({
  id: "parameter_1",
  type: "type/Text",
  "display-name": "Parameter 1",
});

const parameter2 = createMockActionParameter({
  id: "parameter_2",
  type: "type/Text",
  "display-name": "Parameter 2",
});

const implicitUpdateAction = createMockImplicitQueryAction({
  type: "implicit",
  kind: "row/update",
  parameters: [parameter1, parameter2],
});

function setupPrefetch() {
  fetchMock.get(`path:/api/action/${implicitUpdateAction.id}/execute`, {
    parameter_1: "uno",
    parameter_2: "dos",
  });
}

const fetchInitialValues = () =>
  ActionsApi.prefetchValues({
    id: implicitUpdateAction.id,
    parameters: JSON.stringify({}),
  });

function setup(props?: Partial<ActionExecuteModalProps>) {
  setupActionsEndpoints([implicitUpdateAction]);
  setupPrefetch();

  renderWithProviders(
    <ActionExecuteModal {...props} actionId={implicitUpdateAction.id} />,
  );
}

describe("Actions > ActionExecuteModal", () => {
  it("should fetch and load existing values from API for implicit update actions", async () => {
    await setup({
      actionId: implicitUpdateAction.id,
      fetchInitialValues,
      shouldPrefetch: true,
    });

    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();

    await waitForLoaderToBeRemoved();

    await waitFor(async () => {
      expect(screen.getByLabelText("Parameter 1")).toHaveValue("uno");
    });

    await waitFor(async () => {
      expect(screen.getByLabelText("Parameter 2")).toHaveValue("dos");
    });
  });
});
