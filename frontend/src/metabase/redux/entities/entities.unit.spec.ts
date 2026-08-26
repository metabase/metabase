import { reducer } from "./index";

const update = (fields: Record<string, unknown>) => ({
  type: "metabase/entities/UPDATE",
  payload: { entities: { fields } },
});

const FIELD = {
  id: 1,
  name: "ID",
  display_name: "ID",
  base_type: "type/BigInteger",
};

describe("entities reducer", () => {
  it("keeps the slice and its entries identical when a write changes nothing", () => {
    const before = reducer(undefined, update({ 1: FIELD }));
    const after = reducer(before, update({ 1: { ...FIELD } }));

    expect(after).toBe(before);
    expect(after.fields).toBe(before.fields);
    expect(after.fields[1]).toBe(before.fields[1]);
  });

  it("keeps untouched entries identical when a sibling changes", () => {
    const before = reducer(
      undefined,
      update({ 1: FIELD, 2: { ...FIELD, id: 2, name: "TOTAL" } }),
    );
    const after = reducer(before, update({ 2: { id: 2, name: "SUBTOTAL" } }));

    expect(after.fields).not.toBe(before.fields);
    expect(after.fields[1]).toBe(before.fields[1]);
    expect(after.fields[2]).not.toBe(before.fields[2]);
    expect(after.fields[2]).toMatchObject({ id: 2, name: "SUBTOTAL" });
  });

  it("shallow-merges so a partial write does not drop existing keys", () => {
    const before = reducer(undefined, update({ 1: FIELD }));
    const after = reducer(before, update({ 1: { id: 1, description: "pk" } }));

    expect(after.fields[1]).toMatchObject({
      ...FIELD,
      description: "pk",
    });
  });

  it("deletes an entry written as null, and only then copies the slice", () => {
    const before = reducer(undefined, update({ 1: FIELD }));
    const unchanged = reducer(before, update({ 999: null }));
    const deleted = reducer(before, update({ 1: null }));

    expect(unchanged.fields).toBe(before.fields);
    expect(deleted.fields[1]).toBeUndefined();
  });
});
