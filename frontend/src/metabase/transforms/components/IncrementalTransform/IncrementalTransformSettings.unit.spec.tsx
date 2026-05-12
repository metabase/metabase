import { screen } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";
import { FormProvider } from "metabase/forms";
import type { TransformSource } from "metabase-types/api";
import { createMockTransformSource } from "metabase-types/api/mocks";

import { IncrementalTransformSettings } from "./IncrementalTransformSettings";
import { getInitialValues } from "./form";

jest.mock("./useHasCheckpointOptions", () => ({
  useHasCheckpointOptions: jest.fn(),
}));

jest.mock("metabase/transforms/utils", () => ({
  getLibQuery: () => null,
  isMbqlQuery: () => false,
}));

const { useHasCheckpointOptions } = jest.requireMock(
  "./useHasCheckpointOptions",
);

type SetupOpts = {
  incremental?: boolean;
  source?: TransformSource;
  onIncrementalChange?: () => void;
  hookOverrides?: Partial<ReturnType<typeof useHasCheckpointOptions>>;
};

function setup({
  incremental = false,
  source = createMockTransformSource(),
  onIncrementalChange = jest.fn(),
  hookOverrides = {},
}: SetupOpts = {}) {
  const hookDefaults = {
    hasCheckpointOptions: true,
    hasNativeCheckpointOptions: true,
    transformType: "query" as const,
    ...hookOverrides,
  };

  useHasCheckpointOptions.mockReturnValue(hookDefaults);

  const initialValues = getInitialValues({ incremental });

  renderWithProviders(
    <FormProvider initialValues={initialValues} onSubmit={jest.fn()}>
      <IncrementalTransformSettings
        source={source}
        incremental={incremental}
        onIncrementalChange={onIncrementalChange}
      />
    </FormProvider>,
  );
}

function getSwitch() {
  return screen.getByRole("switch");
}

describe("IncrementalTransformSettings", () => {
  it("disables switch when hasCheckpointOptions is false and incremental is off", () => {
    setup({
      incremental: false,
      hookOverrides: {
        transformType: "mbql",
        hasCheckpointOptions: false,
      },
    });

    expect(getSwitch()).toBeDisabled();
  });

  it("enables switch when hasCheckpointOptions is false but incremental is on", () => {
    setup({
      incremental: true,
      hookOverrides: {
        transformType: "native",
        hasCheckpointOptions: false,
      },
    });

    expect(getSwitch()).toBeEnabled();
  });

  it("disables switch when hasNativeCheckpointOptions is false and incremental is off", () => {
    setup({
      incremental: false,
      hookOverrides: {
        transformType: "native",
        hasNativeCheckpointOptions: false,
      },
    });

    expect(getSwitch()).toBeDisabled();
  });

  it("enables switch when hasNativeCheckpointOptions is false but incremental is on", () => {
    setup({
      incremental: true,
      hookOverrides: {
        transformType: "native",
        hasNativeCheckpointOptions: false,
      },
    });

    expect(getSwitch()).toBeEnabled();
  });
});
