import { screen } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockCard } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { AIMarkdown } from "./AIMarkdown";

const setup = (props: { children: string }) => {
  setupEnterprisePlugins();
  const settings = mockSettings({ "site-url": "http://localhost:3000" });

  fetchMock.get(
    "path:/api/card/123",
    createMockCard({ id: 123, name: "Test Question" }),
  );

  return renderWithProviders(<AIMarkdown {...props} />, {
    storeInitialState: createMockState({ settings }),
  });
};

describe("AIMarkdown", () => {
  it("should render internal links for Metabase protocol links", async () => {
    setup({ children: "[My Question](metabase://question/123)" });

    // Wait for the component to render
    const link = await screen.findByText("My Question");
    expect(link).toBeInTheDocument();

    // Verify it's rendered as a smart link by checking for the icon
    expect(screen.getByRole("img", { name: /icon/ })).toBeInTheDocument();
  });
});
