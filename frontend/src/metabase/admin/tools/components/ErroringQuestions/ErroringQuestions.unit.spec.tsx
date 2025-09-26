import { renderWithProviders, screen } from "__support__/ui";

import { ErroringQuestions } from "./ErroringQuestions";

const mockErroringQuestions = [
  {
    card_id: 1,
    name: "Test Question 1",
    error: "Syntax error: invalid SQL query",
    collection: "Test Collection",
    database: "Test DB",
    last_run_at: "2024-01-15T10:30:00Z",
  },
  {
    card_id: 2,
    name: "Test Question 2",
    error: "Connection timeout: could not connect to database",
    collection: "Another Collection",
    database: "Another DB",
    last_run_at: "2024-01-14T15:45:00Z",
  },
];

describe("ErroringQuestions", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should show upsell when no questions data is provided", () => {
    renderWithProviders(<ErroringQuestions />);

    expect(screen.getByText("Troubleshoot faster")).toBeInTheDocument();
    expect(screen.getByText("Try for free")).toBeInTheDocument();
  });

  it("should show upsell when questions array is empty", () => {
    renderWithProviders(<ErroringQuestions questions={[]} />);

    expect(screen.getByText("Troubleshoot faster")).toBeInTheDocument();
  });

  it("should show table with proper click handlers when questions data is provided", () => {
    renderWithProviders(<ErroringQuestions questions={mockErroringQuestions} />);

    // Should show the table headers
    expect(screen.getByText("Question")).toBeInTheDocument();
    expect(screen.getByText("Collection")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Last Run")).toBeInTheDocument();

    // Should show the questions
    expect(screen.getByText("Test Question 1")).toBeInTheDocument();
    expect(screen.getByText("Test Question 2")).toBeInTheDocument();
    expect(screen.getByText("Test Collection")).toBeInTheDocument();
    expect(screen.getByText("Another Collection")).toBeInTheDocument();

    // Should show click instruction
    expect(screen.getByText("Click on a question to view and fix the error.")).toBeInTheDocument();

    // Rows should have cursor pointer class
    const rows = screen.getAllByTestId("erroring-question-row");
    expect(rows).toHaveLength(2);
    rows.forEach(row => {
      expect(row).toHaveClass("cursor-pointer");
    });
  });

  it("should show loading state", () => {
    renderWithProviders(<ErroringQuestions questions={mockErroringQuestions} isLoading={true} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should show error state", () => {
    const error = new Error("Failed to load erroring questions");
    renderWithProviders(<ErroringQuestions questions={mockErroringQuestions} error={error} />);

    expect(screen.getByText("Failed to load erroring questions")).toBeInTheDocument();
  });

  it("should truncate long error messages", () => {
    const longErrorQuestion = [{
      card_id: 3,
      name: "Question with long error",
      error: "A".repeat(150), // 150 character error message
      collection: "Test Collection",
      database: "Test DB",
      last_run_at: "2024-01-15T10:30:00Z",
    }];

    renderWithProviders(<ErroringQuestions questions={longErrorQuestion} />);

    const errorText = screen.getByText(/A{100}\.{3}/); // Should be truncated to ~100 chars + "..."
    expect(errorText).toBeInTheDocument();
    expect(errorText.textContent?.length).toBeLessThan(150);
  });
});