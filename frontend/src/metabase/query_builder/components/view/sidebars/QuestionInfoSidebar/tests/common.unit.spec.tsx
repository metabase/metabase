import { createMockCard } from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup } from "./setup";

describe("QuestionInfoSidebar", () => {
  it("should display description of a question", async () => {
    const description = "abc";
    await setup({ card: createMockCard({ description }) });
    expect(screen.getByText(description)).toBeInTheDocument();
  });
});
