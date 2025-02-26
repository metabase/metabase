import { screen } from "__support__/ui";

export function assertLegaleseModal() {
  expect(screen.getByRole("dialog")).toBeInTheDocument();

  expect(screen.getByText("First, some legalese")).toBeInTheDocument();
  expect(screen.getByText("Decline and go back")).toBeInTheDocument();
  expect(screen.getByText("Agree and continue")).toBeInTheDocument();
}
