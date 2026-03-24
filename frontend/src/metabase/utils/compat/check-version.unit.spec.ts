import React from "react";

import { getMajorReactVersion } from "./check-version";

describe("getMajorReactVersion", () => {
  const versions = [
    { version: "0.14.0", expected: 0 },
    { version: "15.0.0", expected: 15 },
    { version: "16.0.0", expected: 16 },
    { version: "16.8.0", expected: 16 },
    { version: "17.0.0", expected: 17 },
    { version: "17.0.2", expected: 17 },
    { version: "18.0.0", expected: 18 },
    { version: "18.1.0", expected: 18 },
  ];

  beforeEach(() => {
    jest.resetModules();
  });

  it.each(versions)(
    "should return $expected for React version $version",
    ({ version, expected }) => {
      Object.defineProperty(React, "version", {
        value: version,
        writable: true,
      });

      expect(getMajorReactVersion()).toBe(expected);
    },
  );

  it("should return NaN for an invalid version string", () => {
    Object.defineProperty(React, "version", {
      value: "invalid-version",
      writable: true,
    });

    expect(getMajorReactVersion()).toBeNaN();
  });
});
