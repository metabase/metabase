import { getErrors } from "./utils";

describe("getErrors", () => {
  it("returns the field error messages", () => {
    expect(
      getErrors({ data: { errors: { email: "Unknown email", token: "Bad" } } }),
    ).toEqual(["Unknown email", "Bad"]);
  });

  it("returns no errors when the response has no field errors", () => {
    expect(getErrors({ data: { message: "Something went wrong" } })).toEqual(
      [],
    );
    expect(getErrors({ data: { errors: "Unknown email" } })).toEqual([]);
  });

  it("returns no errors for errors without a data body", () => {
    expect(getErrors({ status: 500 })).toEqual([]);
    expect(getErrors({ data: "Bad Gateway" })).toEqual([]);
    expect(getErrors(undefined)).toEqual([]);
  });
});
