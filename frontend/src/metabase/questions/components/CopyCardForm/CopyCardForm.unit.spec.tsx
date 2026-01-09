import userEvent from "@testing-library/user-event";

import { setupDashboardEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { CardType } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardTab,
} from "metabase-types/api/mocks";

import { CopyCardForm, type CopyCardProperties } from "./CopyCardForm";

const FOO_DASH = createMockDashboard({
  id: 1,
  collection_id: 1,
  name: "Foo Dashboard",
  tabs: [
    createMockDashboardTab({ id: 1, name: "Foo Tab 1" }),
    createMockDashboardTab({ id: 2, name: "Foo Tab 2" }),
  ],
});

type SetupOpts = {
  initialValues?: Partial<CopyCardProperties>;
  model?: CardType;
};

function setup({ initialValues = {}, model = "question" }: SetupOpts = {}) {
  const onSubmit = jest.fn((question) => Promise.resolve(question));
  const onSaved = jest.fn();
  const onCancel = jest.fn();

  setupDashboardEndpoints(FOO_DASH);

  renderWithProviders(
    <CopyCardForm
      model={model}
      initialValues={initialValues}
      onSubmit={onSubmit}
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  );

  return { onSubmit, onSaved, onCancel };
}

describe("CopyQuestionForm", () => {
  it("should not allow to enter a name with more than 254 characters", async () => {
    setup();

    const nameInput = screen.getByLabelText("Name");
    const descriptionInput = screen.getByLabelText("Description");
    const saveButton = screen.getByRole("button", { name: "Duplicate" });

    await userEvent.click(nameInput);
    await userEvent.paste("A".repeat(255));
    await userEvent.click(descriptionInput);
    expect(
      await screen.findByText(/must be 254 characters or less/),
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it("should show validation error on mount if name is too long", async () => {
    setup({
      initialValues: { name: "A".repeat(255) },
    });

    const saveButton = screen.getByRole("button", { name: "Duplicate" });

    expect(
      await screen.findByText(/must be 254 characters or less/),
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it("should call onSaved with a dashboardTabId if one is selected", async () => {
    const values = {
      name: "Foo",
      collection_id: 1,
      dashboard_id: 1,
      description: null,
      dashboard_tab_id: 1,
    };
    const { onSaved } = setup({ initialValues: values });

    await userEvent.click(
      await screen.findByRole("button", { name: "Duplicate" }),
    );
    expect(onSaved).toHaveBeenCalledWith(values, {
      dashboardTabId: values.dashboard_tab_id,
    });
  });

  it("should not show the dashboard tab input for models other than question", async () => {
    setup({ model: "model" });
    expect(
      await screen.findByText(/Where do you want to save this/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Which tab should this go on/),
    ).not.toBeInTheDocument();
  });
});
