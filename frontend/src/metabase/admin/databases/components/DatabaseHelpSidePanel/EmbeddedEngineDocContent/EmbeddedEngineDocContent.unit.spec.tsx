import { waitFor } from "@testing-library/react";

import { render, screen } from "__support__/ui";

import { EmbeddedEngineDocContent } from "./EmbeddedEngineDocContent";

jest.mock(
  "docs/databases/connections/postgresql.md",
  () => "Postgres Markdown content",
);

describe("EmbeddedEngineDocContent", () => {
  it("renders markdown content", async () => {
    render(<EmbeddedEngineDocContent engineKey="postgres" />);
    await waitFor(() => {
      expect(screen.getByText("Postgres Markdown content")).toBeInTheDocument();
    });
  });

  it("renders a loading state", async () => {
    render(<EmbeddedEngineDocContent engineKey="postgres" />);

    expect(screen.getByTestId("loader")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
    });
  });

  it("renders an alert with error message when markdown loading fails", async () => {
    const errorEngineKey = "athena"; // Loading this engine will throw an error as it is not mocked
    jest.spyOn(console, "error").mockImplementationOnce(() => {});
    render(<EmbeddedEngineDocContent engineKey={errorEngineKey} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Failed to load detailed documentation"),
    ).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });
});
