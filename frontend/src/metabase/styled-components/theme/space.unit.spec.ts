import { space } from "./space";

it("returns pixel amount for acceptable levels", () => {
  expect(space(0)).toBe("4px");
  expect(space(1)).toBe("8px");
  expect(space(2)).toBe("16px");
  expect(space(3)).toBe("32px");
  expect(space(4)).toBe("64px");
  expect(space(5)).toBe("128px");
});

it("returns empty string for unacceptable integer levels", () => {
  expect(space(-1)).toBe("");
  expect(space(6)).toBe("");
});
