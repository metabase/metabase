import { createMockField } from "metabase-types/api/mocks";

import { inferHistoryBinding } from "./inference";

const field = (id: number, name: string, isDateField = false) =>
  createMockField({
    id,
    name,
    display_name: name,
    base_type: isDateField ? "type/Date" : "type/Text",
    effective_type: isDateField ? "type/Date" : "type/Text",
  });

describe("inferHistoryBinding", () => {
  it("reads valid_from and valid_to as the start and end dates", () => {
    const binding = inferHistoryBinding([
      field(1, "worker_id"),
      field(2, "valid_from", true),
      field(3, "valid_to", true),
    ]);

    expect(binding.validFromFieldId).toBe(2);
    expect(binding.validToFieldId).toBe(3);
  });

  it("reads start_date and end_date as the start and end dates", () => {
    const binding = inferHistoryBinding([
      field(1, "deal_id"),
      field(2, "stage"),
      field(3, "start_date", true),
      field(4, "end_date", true),
    ]);

    expect(binding.validFromFieldId).toBe(3);
    expect(binding.validToFieldId).toBe(4);
  });

  it("falls back to the table's time column for the start date", () => {
    const binding = inferHistoryBinding([
      field(1, "deal_id"),
      field(2, "updated_at", true),
      field(3, "changed_on", true),
      field(4, "stage"),
    ]);

    expect(binding.validFromFieldId).toBe(3);
    expect(binding.validToFieldId).toBeNull();
  });

  it("doesn't use the end date as the start date", () => {
    const binding = inferHistoryBinding([
      field(1, "deal_id"),
      field(2, "ended_at", true),
    ]);

    expect(binding.validFromFieldId).toBeNull();
    expect(binding.validToFieldId).toBe(2);
  });
});
