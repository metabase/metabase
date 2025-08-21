import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { EmbeddingHubStepId } from "../../types";
import { getEmbeddingHubSteps } from "../../utils";

import { EmbeddingChecklist } from "./EmbeddingChecklist";

const setup = ({
  completedSteps = {},
  defaultOpenStep,
  isAdmin = true,
}: {
  completedSteps?: Partial<Record<EmbeddingHubStepId, boolean>>;
  defaultOpenStep?: EmbeddingHubStepId;
  isAdmin?: boolean;
} = {}) => {
  const steps = getEmbeddingHubSteps();

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
  });

  const utils = renderWithProviders(
    <EmbeddingChecklist
      steps={steps}
      completedSteps={completedSteps}
      defaultOpenStep={defaultOpenStep}
    />,
    { storeInitialState: state },
  );

  return { ...utils };
};

describe("EmbeddingChecklist", () => {
  it("shows the check icon next to completed steps", () => {
    setup({ completedSteps: { "create-test-embed": true, "add-data": false } });

    const completedStep = screen.getByTestId("create-test-embed-item");

    expect(
      within(completedStep).getByLabelText("check icon"),
    ).toBeInTheDocument();
    expect(
      within(completedStep).getByText("Create a test embed"),
    ).toBeInTheDocument();

    const incompleteStep = screen.getByTestId("add-data-item");

    expect(
      within(incompleteStep).queryByLabelText("check icon"),
    ).not.toBeInTheDocument();
    expect(
      within(incompleteStep).getByText("Add your data"),
    ).toBeInTheDocument();
  });

  it("should show database actions when clicking 'Add your data' step", async () => {
    setup();

    const addDataStep = screen.getByText("Add your data");
    await userEvent.click(addDataStep);

    expect(screen.getByText("Add Database")).toBeInTheDocument();
  });
});
