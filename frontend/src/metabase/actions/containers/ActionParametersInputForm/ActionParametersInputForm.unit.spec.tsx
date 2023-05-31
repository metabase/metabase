import _ from "underscore";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";

import { render, screen } from "__support__/ui";

import {
  createMockActionDashboardCard,
  createMockActionParameter,
  createMockFieldSettings,
  createMockQueryAction,
  createMockImplicitQueryAction,
  createMockDashboard,
} from "metabase-types/api/mocks";

import ActionParametersInputForm, {
  ActionParametersInputFormProps,
} from "./ActionParametersInputForm";
import ActionParametersInputModal, {
  ActionParametersInputModalProps,
} from "./ActionParametersInputModal";

const parameter1 = createMockActionParameter({
  id: "parameter_1",
  name: "Parameter 1",
  type: "type/Text",
});

const parameter2 = createMockActionParameter({
  id: "parameter_2",
  name: "Parameter 2",
  type: "type/Text",
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

const defaultProps: ActionParametersInputFormProps = {
  action: mockAction,
  mappedParameters: [],
  dashboard: createMockDashboard({ id: 123 }),
  dashcard: createMockActionDashboardCard({ id: 456, action: mockAction }),
  dashcardParamValues: {},
  onCancel: _.noop,
  onSubmitSuccess: _.noop,
  onSubmit: jest.fn().mockResolvedValue({ success: true }),
};

function setup(options?: Partial<ActionParametersInputModalProps>) {
  render(<ActionParametersInputForm {...defaultProps} {...options} />);
}

async function setupModal(options?: any) {
  render(
    <ActionParametersInputModal
      title="Test Modal"
      onClose={_.noop}
      {...defaultProps}
      {...options}
    />,
  );
}

function setupPrefetch() {
  fetchMock.get("path:/api/dashboard/123/dashcard/456/execute", {
    parameter_1: "uno",
    parameter_2: "dos",
  });
}

describe("Actions > ActionParametersInputForm", () => {
  it("should render an action form", async () => {
    await setup();
    expect(screen.getByTestId("action-form")).toBeInTheDocument();
    expect(screen.getByText("Parameter 1")).toBeInTheDocument();
    expect(screen.getByText("Parameter 2")).toBeInTheDocument();
  });

  it("should call onCancel when clicking the cancel button", async () => {
    const cancelSpy = jest.fn();
    await setup({ onCancel: cancelSpy });
    userEvent.click(screen.getByText("Cancel"));
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("passes form values to submit handler", async () => {
    const submitSpy = jest.fn().mockResolvedValue({ success: true });
    await setup({
      onSubmit: submitSpy,
    });

    userEvent.type(screen.getByLabelText("Parameter 1"), "uno");
    await waitFor(() =>
      expect(screen.getByLabelText("Parameter 1")).toHaveValue("uno"),
    );

    userEvent.type(screen.getByLabelText("Parameter 2"), "dos");
    await waitFor(() =>
      expect(screen.getByLabelText("Parameter 2")).toHaveValue("dos"),
    );

    userEvent.click(screen.getByText(mockAction.name));

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith({
        parameter_1: "uno",
        parameter_2: "dos",
      });
    });
  });

  it("should generate field types from parameter types", async () => {
    const action = createMockImplicitQueryAction({
      parameters: [
        createMockActionParameter({
          id: "parameter_1",
          "display-name": "Parameter 1",
          type: "type/Text",
        }),
        createMockActionParameter({
          id: "parameter_2",
          "display-name": "Parameter 2",
          type: "type/Integer",
        }),
      ],
    });
    await setup({ action });

    expect(screen.getByPlaceholderText("Parameter 1")).toHaveAttribute(
      "type",
      "text",
    );
    expect(screen.getByPlaceholderText("Parameter 2")).toHaveAttribute(
      "type",
      "number",
    );
  });

  it("should fetch and load existing values from API for implicit update actions", async () => {
    setupPrefetch();

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

    await setup({
      action: createMockImplicitQueryAction({
        type: "implicit",
        kind: "row/update",
        parameters: [idParameter, parameter1, parameter2],
      }),
      mappedParameters: [idParameter],
      dashcardParamValues: {
        id: 888,
      },
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
      action: createMockImplicitQueryAction({
        type: "implicit",
        kind: "row/update",
      }),
      dashcardParamValues: {},
    });

    expect(screen.getByText(/Choose a record to update/i)).toBeInTheDocument();
  });

  it('should change the submit button label to "delete" for an implicit delete action', async () => {
    await setup({
      action: createMockImplicitQueryAction({
        type: "implicit",
        kind: "row/delete",
      }),
      showConfirmMessage: true,
    });

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it('should change the submit button label to "update" for an implicit update action', async () => {
    setupPrefetch();

    await setup({
      action: createMockImplicitQueryAction({
        type: "implicit",
        kind: "row/update",
      }),
      dashcardParamValues: {
        id: 888,
      },
    });

    expect(
      await screen.findByRole("button", { name: "Update" }),
    ).toBeInTheDocument();
  });

  describe("ActionParametersInputModal", () => {
    it("should render a parametersInputForm in a modal", async () => {
      await setupModal({ title: "My Test Modal" });

      expect(screen.getByText("My Test Modal")).toBeInTheDocument();
      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Parameter 1 placeholder"),
      ).toHaveAttribute("type", "text");
    });

    it("should show a delete confirm message with the showConfirmMessage prop", async () => {
      await setupModal({
        title: "Data Destruction Modal",
        action: createMockImplicitQueryAction({
          type: "implicit",
          kind: "row/delete",
        }),
        missingParameters: [],
        showConfirmMessage: true,
      });

      expect(
        screen.getByText(/this action cannot be undone/i),
      ).toBeInTheDocument();
    });
  });
});
