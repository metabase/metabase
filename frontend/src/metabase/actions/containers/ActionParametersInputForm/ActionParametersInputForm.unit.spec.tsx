import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import _ from "underscore";

import { getIcon, render, screen } from "__support__/ui";
import {
  createMockActionParameter,
  createMockFieldSettings,
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import type { ActionParametersInputFormProps } from "./ActionParametersInputForm";
import ActionParametersInputForm from "./ActionParametersInputForm";
import type { ActionParametersInputModalProps } from "./ActionParametersInputModal";
import ActionParametersInputModal from "./ActionParametersInputModal";

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
  prefetchesInitialValues: false,
  initialValues: {},
  onCancel: _.noop,
  onSubmitSuccess: _.noop,
  onSubmit: jest.fn().mockResolvedValue({ success: true }),
};

function setup(options?: Partial<ActionParametersInputModalProps>) {
  render(<ActionParametersInputForm {...defaultProps} {...options} />);
}

async function setupModal(options?: Partial<ActionParametersInputModalProps>) {
  render(
    <ActionParametersInputModal
      showEmptyState={false}
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
    await userEvent.click(screen.getByText("Cancel"));
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("passes form values to submit handler", async () => {
    const submitSpy = jest.fn().mockResolvedValue({ success: true });
    await setup({
      onSubmit: submitSpy,
    });

    await userEvent.type(screen.getByLabelText("Parameter 1"), "uno");
    await waitFor(() =>
      expect(screen.getByLabelText("Parameter 1")).toHaveValue("uno"),
    );

    await userEvent.type(screen.getByLabelText("Parameter 2"), "dos");
    await waitFor(() =>
      expect(screen.getByLabelText("Parameter 2")).toHaveValue("dos"),
    );

    await userEvent.click(screen.getByText(mockAction.name));

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
      initialValues: {
        id: 888,
      },
      prefetchesInitialValues: true,
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
        showConfirmMessage: true,
      });

      expect(
        screen.getByText(/this action cannot be undone/i),
      ).toBeInTheDocument();
    });

    it("should render action edit action icon if onEdit is passed", async () => {
      const onEditMock = jest.fn();

      await setupModal({ onEdit: onEditMock });

      const editActionTrigger = getIcon("pencil");
      expect(editActionTrigger).toBeInTheDocument();

      await userEvent.hover(editActionTrigger);

      expect(screen.getByText("Edit this action")).toBeInTheDocument();

      await userEvent.click(editActionTrigger);

      expect(onEditMock).toHaveBeenCalledTimes(1);
    });
  });
});
