import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";
import _ from "underscore";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockActionParameter,
  createMockImplicitQueryAction,
} from "metabase-types/api/mocks";
import { ActionsApi } from "metabase/services";

import {
  ActionExecuteModal,
  type Props as ActionExecuteModalProps,
} from "./ActionExecuteModal";

const dashboardId = 123;
const dashcardId = 456;

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

const mockAction = createMockImplicitQueryAction({
  type: "implicit",
  kind: "row/update",
  parameters: [parameter1, parameter2],
});

const implicitUpdateAction = createMockImplicitQueryAction({
  type: "implicit",
  kind: "row/update",
  parameters: [parameter1, parameter2],
});

function setup(props?: Partial<ActionExecuteModalProps>) {
  renderWithProviders(<ActionExecuteModal {...props} actionId={undefined} />);
}

function setupPrefetch() {
  fetchMock.get(
    `path:/api/dashboard/${dashboardId}/dashcard/${dashcardId}/execute`,
    {
      parameter_1: "uno",
      parameter_2: "dos",
    },
  );
}

const fetchInitialValues = () =>
  ActionsApi.prefetchDashcardValues({
    dashboardId,
    dashcardId,
    parameters: JSON.stringify({}),
  }).catch(_.noop);

describe("Actions > ActionExecuteModal", () => {
  it("should fetch and load existing values from API for implicit update actions", async () => {
    setupPrefetch();

    await setup({
      actionId: mockAction.id,
      fetchInitialValues,
      initialValues: {
        id: 888,
      },
      shouldPrefetch: true,
    });

    await waitFor(async () => {
      expect(screen.getByLabelText("Parameter 1")).toHaveValue("uno");
    });

    await waitFor(async () => {
      expect(screen.getByLabelText("Parameter 2")).toHaveValue("dos");
    });
  });

  it("should show a warning if an implicit update action does not have a linked ID", async () => {
    await setup({
      actionId: implicitUpdateAction.id,
      fetchInitialValues,
      initialValues: {},
      shouldPrefetch: true,
    });

    expect(screen.getByText(/Choose a record to update/i)).toBeInTheDocument();
  });
});
