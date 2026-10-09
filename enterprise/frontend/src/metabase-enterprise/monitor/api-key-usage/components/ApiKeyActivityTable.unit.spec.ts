import type { ApiKey } from "metabase-types/api";

import { compareByLastUsedAtDesc } from "./ApiKeyActivityTable";

const apiKey = (id: number, lastUsedAt: string | null): ApiKey => ({
  name: `Key ${id}`,
  id,
  group: { id: 1, name: "All Users" },
  creator_id: 1,
  masked_key: "mb_••••••••1234",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: { id: 1, common_name: "Bobby Tables" },
  last_used_at: lastUsedAt,
});

describe("compareByLastUsedAtDesc", () => {
  it("sorts most recently active first", () => {
    const older = apiKey(1, "2026-01-01T00:00:00Z");
    const newer = apiKey(2, "2026-02-01T00:00:00Z");

    expect([older, newer].sort(compareByLastUsedAtDesc)).toEqual([
      newer,
      older,
    ]);
  });

  it("sorts keys with no activity in the window last, regardless of input order", () => {
    const active = apiKey(1, "2026-01-01T00:00:00Z");
    const unused = apiKey(2, null);

    expect([unused, active].sort(compareByLastUsedAtDesc)).toEqual([
      active,
      unused,
    ]);
    expect([active, unused].sort(compareByLastUsedAtDesc)).toEqual([
      active,
      unused,
    ]);
  });

  it("leaves two unused keys in a stable relative order", () => {
    const a = apiKey(1, null);
    const b = apiKey(2, null);

    expect([a, b].sort(compareByLastUsedAtDesc)).toEqual([a, b]);
  });
});
