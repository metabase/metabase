import { waitFor } from "@testing-library/react";

import { render, screen } from "__support__/ui";

import { EmbeddedEngineDocContent } from "./EmbeddedEngineDocContent";

jest.mock(
  "docs/databases/connections/postgresql.md",
  () => "Postgres Markdown content",
);
jest.mock("docs/databases/connections/athena.md", () => {
  throw new Error("Failed to import file");
});

describe("EmbeddedEngineDocContent", () => {
  it("renders markdown content", async () => {
    render(<EmbeddedEngineDocContent engineKey="postgres" />);
    expect(
      await screen.findByText("Postgres Markdown content"),
    ).toBeInTheDocument();
  });

  it("renders a loading state", async () => {
    render(<EmbeddedEngineDocContent engineKey="postgres" />);

    expect(screen.getByTestId("loader")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
    });
  });

  it("renders an alert with error message when markdown fails to load", async () => {
    const errorEngineKey = "athena"; // Loading this engine throws an error
    jest.spyOn(console, "error").mockImplementationOnce(() => {});
    render(<EmbeddedEngineDocContent engineKey={errorEngineKey} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText("Failed to load detailed documentation"),
    ).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });
});
