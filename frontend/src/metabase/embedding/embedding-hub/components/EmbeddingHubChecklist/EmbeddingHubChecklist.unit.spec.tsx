import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { EmbeddingHubStepId } from "../../types";
import { getEmbeddingHubSteps } from "../../utils";

import { EmbeddingHubChecklist } from "./EmbeddingHubChecklist";

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
    settings: mockSettings({
      "show-metabase-links": true,
    }),
  });

  return renderWithProviders(
    <EmbeddingHubChecklist
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

  it("shows docs links with utm on call-to-action buttons", async () => {
    setup({ defaultOpenStep: "configure-row-column-security" });

    const link = screen.getByRole("link", { name: /Read the docs/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/permissions/row-and-column-security.html?utm_source=product&utm_medium=docs&utm_campaign=embedding-hub&utm_content=configure-row-column-security&source_plan=oss",
    );
  });

  it("should add data button on 'Add your data' step", async () => {
    setup();

    await userEvent.click(screen.getByText("Add your data"));

    expect(screen.getByText("Add data")).toBeInTheDocument();
  });
});
