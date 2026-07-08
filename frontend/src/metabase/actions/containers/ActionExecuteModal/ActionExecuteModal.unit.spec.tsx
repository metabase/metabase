import fetchMock from "fetch-mock";
import { useCallback } from "react";

import { setupActionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { actionApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { useDispatch } from "metabase/redux";
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

function TestActionExecuteModal(props?: Partial<ActionExecuteModalProps>) {
  const dispatch = useDispatch();
  const fetchInitialValues = useCallback(
    () =>
      runRtkEndpoint(
        { id: implicitUpdateAction.id, parameters: {} },
        dispatch,
        actionApi.endpoints.prefetchActionValues,
      ),
    [dispatch],
  );

  return (
    <ActionExecuteModal
      opened
      onClose={() => {}}
      fetchInitialValues={fetchInitialValues}
      {...props}
      actionId={implicitUpdateAction.id}
    />
  );
}

function setup(props?: Partial<ActionExecuteModalProps>) {
  setupActionsEndpoints([implicitUpdateAction]);
  setupPrefetch();

  renderWithProviders(<TestActionExecuteModal {...props} />);
}

describe("Actions > ActionExecuteModal", () => {
  it("should fetch and load existing values from API for implicit update actions", async () => {
    await setup({
      actionId: implicitUpdateAction.id,
      shouldPrefetch: true,
    });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();

    await waitForLoaderToBeRemoved();

    await waitFor(async () => {
      expect(screen.getByLabelText("Parameter 1")).toHaveValue("uno");
    });

    await waitFor(async () => {
      expect(screen.getByLabelText("Parameter 2")).toHaveValue("dos");
    });
  });
});
