import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import type { Advisory } from "metabase-types/api";
import { createMockVersion } from "metabase-types/api/mocks";
import { createAdvisory } from "metabase-types/api/mocks/security-center";

import { AdvisoryCard } from "./AdvisoryCard";

const setup = ({
  advisory,
  isAffecting = true,
}: {
  advisory: Advisory;
  isAffecting?: boolean;
}) => {
  renderWithProviders(
    <AdvisoryCard advisory={advisory} isAffecting={isAffecting} />,
    {
      storeInitialState: {
        settings: createMockSettingsState({
          version: createMockVersion({ tag: "v0.59.3" }),
        }),
      },
    },
  );
};

describe("AdvisoryCard", () => {
  it("renders markdown in the description", () => {
    setup({
      advisory: createAdvisory({
        description: "A **critical** flaw in the [handler](https://acme.test).",
      }),
    });

    const card = screen.getByTestId("advisory-card");

    expect(within(card).getByText("critical").tagName).toBe("STRONG");

    const link = within(card).getByRole("link", { name: "handler" });
    expect(link).toHaveAttribute("href", "https://acme.test");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders markdown lists in the remediation", () => {
    setup({
      advisory: createAdvisory({
        affected_versions: [],
        remediation: "Steps:\n\n- Upgrade to `v0.59.4`\n- Rotate the secret",
      }),
    });

    const card = screen.getByTestId("advisory-card");

    expect(within(card).getAllByRole("listitem")).toHaveLength(2);
    expect(within(card).getByText("v0.59.4").tagName).toBe("CODE");
    expect(within(card).getByText("Rotate the secret")).toBeInTheDocument();
  });

  it("renders plain text unchanged", () => {
    setup({
      advisory: createAdvisory({
        description: "Plain description",
        remediation: "Plain remediation",
      }),
    });

    expect(screen.getByText("Plain description")).toBeInTheDocument();
    expect(screen.getByText("Plain remediation")).toBeInTheDocument();
  });
});
