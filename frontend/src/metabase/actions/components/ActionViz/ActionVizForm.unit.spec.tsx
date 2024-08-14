import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { render, screen, waitFor } from "__support__/ui";
import {
  createMockActionDashboardCard,
  createMockActionParameter,
  createMockDashboard,
  createMockFieldSettings,
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import type { ActionFormProps } from "./ActionVizForm";
import ActionVizForm from "./ActionVizForm";

const idParameter = createMockActionParameter({ id: "id" });

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

const action = createMockImplicitQueryAction({
  type: "implicit",
  kind: "row/update",
  parameters: [idParameter, parameter1, parameter2],
});

const mockAction = createMockQueryAction({
  parameters: [parameter1, parameter2],
  visualization_settings: {
    fields: {
      parameter_1: createMockFieldSettings({
        id: "parameter_1",
        placeholder: "Parameter 1 placeholder",
      }),
      parameter_2: createMockFieldSettings({
        id: "parameter_1",
        placeholder: "Parameter 2 placeholder",
      }),
    },
  },
});

const dashcard = createMockActionDashboardCard();

const dashboard = createMockDashboard();

function setupPrefetch() {
  fetchMock.get(
    `path:/api/dashboard/${dashboard.id}/dashcard/${dashcard.id}/execute`,
    {
      parameter_1: "uno",
      parameter_2: "dos",
    },
  );
}

const defaultProps: ActionFormProps = {
  action: mockAction,
  dashcard,
  dashboard,
  mappedParameters: [],
  missingParameters: [],
  dashcardParamValues: {
    id: 888,
  },
  settings: {},
  isSettings: false,
  shouldDisplayButton: true,
  isEditingDashcard: false,
  canEditAction: undefined,
  onSubmit: jest.fn().mockResolvedValue({ success: true }),
};

function setup(options?: Partial<ActionFormProps>) {
  setupPrefetch();

  render(<ActionVizForm {...defaultProps} {...options} />);
}

describe("Actions > ActionVizForm", () => {
  it("should fetch and load existing values from API for implicit update actions", async () => {
    await setup({
      action,
      mappedParameters: [idParameter],
    });

    await userEvent.click(screen.getByText("Click me"));

    await waitFor(async () => {
      expect(screen.getByLabelText("Parameter 1")).toHaveValue("uno");
    });

    await waitFor(async () => {
      expect(screen.getByLabelText("Parameter 2")).toHaveValue("dos");
    });
  });

  it("should show an empty state if an implicit update action does not have a linked ID", async () => {
    await setup({
      action,
      mappedParameters: [idParameter],
      dashcardParamValues: {},
    });

    await userEvent.click(screen.getByText("Click me"));

    expect(screen.getByText(/Choose a record to update/i)).toBeInTheDocument();
  });
});
