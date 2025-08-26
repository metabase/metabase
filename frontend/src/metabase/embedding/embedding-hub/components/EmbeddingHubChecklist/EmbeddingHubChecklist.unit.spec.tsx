import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { EmbeddingHubStepId } from "../../types";
import { getEmbeddingHubSteps } from "../../utils";
import { EmbeddingHub } from "../EmbeddingHub";

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

describe("EmbeddingHub completion logic", () => {
  const setupEmbeddingHub = (settingsOverride = {}) => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings({
        "show-metabase-links": true,
        "embedding-hub-test-embed-snippet-created": false,
        "embedding-hub-production-embed-snippet-created": false,
        ...settingsOverride,
      }),
    });

    return renderWithProviders(<EmbeddingHub />, {
      storeInitialState: state,
    });
  };

  it("marks test embed step as completed when instance setting is true", () => {
    setupEmbeddingHub({
      "embedding-hub-test-embed-snippet-created": true,
    });

    const testEmbedStep = screen.getByTestId("create-test-embed-item");
    expect(
      within(testEmbedStep).getByLabelText("check icon"),
    ).toBeInTheDocument();
  });

  it("marks production embed step as completed when instance setting is true", () => {
    setupEmbeddingHub({
      "embedding-hub-production-embed-snippet-created": true,
    });

    const productionEmbedStep = screen.getByTestId("embed-production-item");
    expect(
      within(productionEmbedStep).getByLabelText("check icon"),
    ).toBeInTheDocument();
  });

  it("does not mark steps as completed when instance settings are false", () => {
    setupEmbeddingHub({
      "embedding-hub-test-embed-snippet-created": false,
      "embedding-hub-production-embed-snippet-created": false,
    });

    const testEmbedStep = screen.getByTestId("create-test-embed-item");
    const productionEmbedStep = screen.getByTestId("embed-production-item");

    expect(
      within(testEmbedStep).queryByLabelText("check icon"),
    ).not.toBeInTheDocument();
    expect(
      within(productionEmbedStep).queryByLabelText("check icon"),
    ).not.toBeInTheDocument();
  });
});
