import { waitFor, waitForElementToBeRemoved } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockActionParameter,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";
import { ActionsApi } from "metabase/services";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";

import { setupActionsEndpoints } from "__support__/server-mocks";
import {
  ActionExecuteModal,
  type Props as ActionExecuteModalProps,
} from "./ActionExecuteModal";

const objectId = 888;

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

const fetchInitialValues = (objectId?: ObjectId | null) =>
  ActionsApi.prefetchValues({
    id: implicitUpdateAction.id,
    parameters: JSON.stringify({
      id: objectId,
    }),
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
      initialValues: {
        id: objectId,
      },
      shouldPrefetch: true,
    });

    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));

    await waitFor(async () => {
      expect(screen.getByLabelText("Parameter 1")).toHaveValue("uno");
    });

    await waitFor(async () => {
      expect(screen.getByLabelText("Parameter 2")).toHaveValue("dos");
    });
  });

  it("should show an empty state if an implicit update action does not have a linked ID", async () => {
    await setup({
      actionId: implicitUpdateAction.id,
      fetchInitialValues,
      initialValues: {
        id: null,
      },
      shouldPrefetch: true,
    });

    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));

    expect(screen.getByText(/Choose a record to update/i)).toBeInTheDocument();
  });
});
