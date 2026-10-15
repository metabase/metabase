import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import { createMockDatabase } from "metabase-types/api/mocks";

import { ToggleNativeQueryPreview } from "./ToggleNativeQueryPreview";

const DB_ID = 2;

function setup({ engine }: { engine: string }) {
  const metadata = createMockMetadata({
    databases: [createMockDatabase({ id: DB_ID, engine })],
  });
  const question = Question.create({
    DEPRECATED_RAW_MBQL_databaseId: DB_ID,
    metadata,
  });

  renderWithProviders(<ToggleNativeQueryPreview question={question} />);
}

describe("ToggleNativeQueryPreview", () => {
  it.each([
    { engine: "h2", show: "View SQL", hide: "Hide SQL" },
    { engine: "mongo", show: "View native query", hide: "Hide native query" },
  ])(
    "should label the toggle for the $engine engine",
    async ({ engine, show, hide }) => {
      setup({ engine });

      await userEvent.click(screen.getByRole("switch", { name: show }));

      expect(screen.getByRole("switch", { name: hide })).toBeInTheDocument();
    },
  );
});
