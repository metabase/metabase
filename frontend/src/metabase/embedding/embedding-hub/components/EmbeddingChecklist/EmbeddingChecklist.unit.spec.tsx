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
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
  });

  return renderWithProviders(
    <EmbeddingChecklist
      steps={getEmbeddingHubSteps()}
      completedSteps={completedSteps}
      defaultOpenStep={defaultOpenStep}
    />,
    { storeInitialState: state },
  );
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

  it("shows docs links on call-to-action buttons", async () => {
    setup();

    await userEvent.click(screen.getByText("Configure sandboxing"));

    expect(
      await screen.findByRole("link", { name: "Configure permissions" }),
    ).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/permissions/embedding.html",
    );

    await userEvent.click(screen.getByText("Secure your embeds"));

    expect(
      await screen.findByRole("link", { name: "Learn more" }),
    ).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/people-and-groups/authenticating-with-jwt.html",
    );
  });

  it("should show database button on 'Add your data' step", async () => {
    setup();

    await userEvent.click(screen.getByText("Add your data"));

    expect(screen.getByText("Add Database")).toBeInTheDocument();
  });
});
