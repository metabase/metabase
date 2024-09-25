// isReactVersion.test.js
import { isReactVersionLessThanOrEqualTo17 } from "./check-version"; // Adjust the path as necessary

describe("isReactVersionLessThanOrEqualTo17", () => {
  const versions = [
    { version: "0.14.0", expected: true },
    { version: "15.0.0", expected: true },
    { version: "16.0.0", expected: true },
    { version: "16.8.0", expected: true },
    { version: "17.0.0", expected: true },
    { version: "17.0.2", expected: true },
    { version: "18.0.0", expected: false },
    { version: "18.1.0", expected: false },
  ];

  versions.forEach(({ version, expected }) => {
    test(`returns ${expected} for React version ${version}`, () => {
      // Call the function with the version string and check the output
      expect(isReactVersionLessThanOrEqualTo17(version)).toBe(expected);
    });
  });
});
