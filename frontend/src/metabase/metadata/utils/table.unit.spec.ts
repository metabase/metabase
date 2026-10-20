import { createMockTable } from "metabase-types/api/mocks";

import { isTableReadOnly } from "./table";

describe("isTableReadOnly", () => {
  it("is read-only when the table cannot be written", () => {
    expect(isTableReadOnly(createMockTable({ can_write: false }))).toBe(true);
  });

  it("is writable when the table can be written", () => {
    expect(isTableReadOnly(createMockTable({ can_write: true }))).toBe(false);
  });

  it("is writable when the response does not say", () => {
    expect(isTableReadOnly(createMockTable())).toBe(false);
  });
});
