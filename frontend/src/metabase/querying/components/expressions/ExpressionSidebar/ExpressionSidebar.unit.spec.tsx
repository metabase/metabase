import userEvent from "@testing-library/user-event";

import { setupDatabaseEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { Editor } from "../Editor";
import { Layout } from "../Layout";

import { ExpressionSidebarProvider, useExpressionSidebarHost } from "./context";

function HostSlot() {
  const host = useExpressionSidebarHost();
  return (
    <div
      data-testid="host-slot"
      data-open={host?.openSidebar ?? "none"}
      ref={host?.setContainer}
    />
  );
}

function setup({ hosted }: { hosted: boolean }) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  setupDatabaseEndpoints(createSampleDatabase());

  const editor = (
    <Layout>
      <Editor
        query={query}
        stageIndex={0}
        expressionMode="expression"
        availableColumns={Lib.expressionableColumns(query, 0)}
        onChange={jest.fn()}
        inline
      />
    </Layout>
  );

  renderWithProviders(
    hosted ? (
      <ExpressionSidebarProvider>
        {editor}
        <HostSlot />
      </ExpressionSidebarProvider>
    ) : (
      editor
    ),
  );
}

describe("expression editor sidebar", () => {
  it("should render the function browser into the host's slot", async () => {
    setup({ hosted: true });

    expect(screen.getByTestId("host-slot")).toHaveAttribute(
      "data-open",
      "none",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Function browser" }),
    );

    const slot = screen.getByTestId("host-slot");
    expect(slot).toHaveAttribute("data-open", "functions");
    expect(slot).toHaveTextContent("Custom expression functions");
  });

  it("should close the sidebar from the panel's close button", async () => {
    setup({ hosted: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Function browser" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByTestId("host-slot")).toHaveAttribute(
      "data-open",
      "none",
    );
  });

  it("should swap the function browser for the column browser", async () => {
    setup({ hosted: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Function browser" }),
    );
    expect(screen.getByTestId("host-slot")).toHaveTextContent(
      "Custom expression functions",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Available columns" }),
    );

    const slot = screen.getByTestId("host-slot");
    expect(slot).toHaveAttribute("data-open", "columns");
    expect(slot).toHaveTextContent("Available columns");
    expect(
      await screen.findByTestId("expression-editor-columns-browser"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("expression-editor-function-browser"),
    ).not.toBeInTheDocument();
  });

  it("should list the columns available at this stage", async () => {
    setup({ hosted: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Available columns" }),
    );

    const browser = await screen.findByTestId(
      "expression-editor-columns-browser",
    );
    expect(within(browser).getByText("Total")).toBeInTheDocument();
    expect(within(browser).getByText("Orders")).toBeInTheDocument();
  });

  it("should keep the sidebar in its own layout when no host offers one", async () => {
    setup({ hosted: false });

    await userEvent.click(
      screen.getByRole("button", { name: "Function browser" }),
    );

    expect(screen.queryByTestId("host-slot")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Custom expression functions"),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByTestId("expression-editor-function-browser"),
    ).toBeInTheDocument();
  });
});
