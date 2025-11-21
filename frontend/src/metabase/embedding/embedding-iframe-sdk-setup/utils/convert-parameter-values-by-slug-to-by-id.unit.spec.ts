import { convertParameterValuesBySlugToById } from "./convert-parameter-values-by-slug-to-by-id";

describe("convertParameterValuesBySlugToById", () => {
  it("returns empty object when valuesBySlug is undefined", () => {
    const result = convertParameterValuesBySlugToById(undefined, [
      { id: "1", slug: "city" },
    ]);
    expect(result).toEqual({});
  });

  it("maps matching slugs to ids", () => {
    const result = convertParameterValuesBySlugToById(
      { city: "NYC", country: "US" },
      [
        { id: "p1", slug: "city" },
        { id: "p2", slug: "country" },
      ],
    );
    expect(result).toEqual({ p1: "NYC", p2: "US" });
  });

  it("ignores params whose slug is missing in valuesBySlug", () => {
    const result = convertParameterValuesBySlugToById({ city: "NYC" }, [
      { id: "p1", slug: "city" },
      { id: "p2", slug: "country" },
    ]);
    expect(result).toEqual({ p1: "NYC" });
    expect(result).not.toHaveProperty("p2");
  });

  it("ignores extra slugs present only in valuesBySlug", () => {
    const result = convertParameterValuesBySlugToById(
      { city: "NYC", extra: 123 },
      [{ id: "p1", slug: "city" }],
    );
    expect(result).toEqual({ p1: "NYC" });
  });

  it("preserves falsy values (0, '', false, null, undefined)", () => {
    const result = convertParameterValuesBySlugToById(
      { a: 0, b: "", c: false, d: null, e: undefined },
      [
        { id: "idA", slug: "a" },
        { id: "idB", slug: "b" },
        { id: "idC", slug: "c" },
        { id: "idD", slug: "d" },
        { id: "idE", slug: "e" },
      ],
    );

    expect(result.idA).toBe(0);
    expect(result.idB).toBe("");
    expect(result.idC).toBe(false);
    expect(result.idD).toBeNull();

    // Ensure the key exists even if value is undefined
    expect(Object.prototype.hasOwnProperty.call(result, "idE")).toBe(true);
    expect(result.idE).toBeUndefined();
  });

  it("returns empty object when params is empty", () => {
    const result = convertParameterValuesBySlugToById({ city: "NYC" }, []);
    expect(result).toEqual({});
  });

  it("does not mutate inputs", () => {
    const values = { city: "NYC" };
    const params = [{ id: "p1", slug: "city" }];

    const valuesCopy = { ...values };
    const paramsCopy = params.map((p) => ({ ...p }));

    const result = convertParameterValuesBySlugToById(values, params);

    expect(result).toEqual({ p1: "NYC" });
    expect(values).toEqual(valuesCopy);
    expect(params).toEqual(paramsCopy);
  });

  it("maps the same slug to multiple ids (duplicate slug entries)", () => {
    const result = convertParameterValuesBySlugToById({ common: 42 }, [
      { id: "one", slug: "common" },
      { id: "two", slug: "common" },
    ]);

    expect(result).toEqual({ one: 42, two: 42 });
  });
});
