import { render, screen } from "__support__/ui";
import type * as Lib from "metabase-lib";

import { NumberFingerprint } from "./NumberFingerprint";

type SetupOpts = {
  fingerprintTypeInfo?: {
    avg: unknown;
    min: unknown;
    max: unknown;
  };
};

function setup({ fingerprintTypeInfo }: SetupOpts) {
  render(
    <NumberFingerprint
      fingerprintTypeInfo={
        fingerprintTypeInfo as Lib.NumberFingerprintDisplayInfo
      }
    />,
  );
}

describe("NumberFingerprint", () => {
  it("should render valid numbers and round to two decimal places", () => {
    setup({
      fingerprintTypeInfo: {
        avg: 123,
        min: 456.789,
        max: 2e4,
      },
    });
    expect(screen.getByText("Average")).toBeInTheDocument();
    expect(screen.getByText("Min")).toBeInTheDocument();
    expect(screen.getByText("Max")).toBeInTheDocument();

    expect(screen.getByText("123")).toBeInTheDocument();
    expect(screen.getByText("456.79")).toBeInTheDocument();
    expect(screen.getByText("20000")).toBeInTheDocument();
  });
  it("should ignore invalid number values in the info", () => {
    setup({
      fingerprintTypeInfo: {
        avg: 123,
        min: Infinity,
        max: NaN,
      },
    });
    expect(screen.getByText("Average")).toBeInTheDocument();
    expect(screen.queryByText("Min")).not.toBeInTheDocument();
    expect(screen.queryByText("Max")).not.toBeInTheDocument();
  });
  it("should ignore invalid non-number values in the info", () => {
    setup({
      fingerprintTypeInfo: {
        avg: 123,
        min: "456",
        max: null,
      },
    });
    expect(screen.getByText("Average")).toBeInTheDocument();
    expect(screen.queryByText("Min")).not.toBeInTheDocument();
    expect(screen.queryByText("Max")).not.toBeInTheDocument();
  });
});
