import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DatabaseSelect } from "./DatabaseSelect";

const DATABASES: Database[] = [
  createMockDatabase({ id: 10, name: "Postgres" }),
  createMockDatabase({ id: 11, name: "Snowflake" }),
];

function setup({ databases = DATABASES } = {}) {
  const onChange = jest.fn();
  renderWithProviders(
    <DatabaseSelect databases={databases} value={null} onChange={onChange} />,
  );
  return { onChange };
}

describe("DatabaseSelect", () => {
  it("can select a database", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByLabelText("Database"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Snowflake" }),
    );

    expect(onChange).toHaveBeenCalledWith(11);
  });
});
