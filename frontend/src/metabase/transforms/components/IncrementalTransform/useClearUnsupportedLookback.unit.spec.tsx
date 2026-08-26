import { renderHook, waitFor } from "@testing-library/react";
import { useFormikContext } from "formik";
import type { ReactNode } from "react";

import { FormProvider } from "metabase/forms";

import { type IncrementalSettingsFormValues, getInitialValues } from "./form";
import {
  type CheckpointFieldOption,
  useClearUnsupportedLookback,
} from "./useClearUnsupportedLookback";

const OPTIONS: CheckpointFieldOption[] = [
  { value: "1", label: "Total", supportsLookback: false },
  { value: "2", label: "Created At", supportsLookback: true },
];

function setup({
  checkpointFilterFieldId,
  options = OPTIONS,
}: {
  checkpointFilterFieldId: string | null;
  options?: CheckpointFieldOption[];
}) {
  const initialValues = getInitialValues({
    incremental: true,
    checkpointFilterFieldId,
    lookbackValue: 4,
    lookbackUnit: "hour",
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <FormProvider initialValues={initialValues} onSubmit={jest.fn()}>
      {children}
    </FormProvider>
  );

  return renderHook(
    () => {
      useClearUnsupportedLookback({ name: "checkpointFilterFieldId", options });
      return useFormikContext<IncrementalSettingsFormValues>();
    },
    { wrapper },
  );
}

describe("useClearUnsupportedLookback", () => {
  it("clears the lookback when the selected column doesn't support one", async () => {
    const { result } = setup({ checkpointFilterFieldId: "1" });
    await waitFor(() => {
      expect(result.current.values.lookbackValue).toBeNull();
    });
  });

  it("keeps the lookback when the selected column supports one", () => {
    const { result } = setup({ checkpointFilterFieldId: "2" });
    expect(result.current.values.lookbackValue).toBe(4);
  });

  it("keeps the lookback when the selected column isn't among the options", () => {
    const { result } = setup({ checkpointFilterFieldId: "99" });
    expect(result.current.values.lookbackValue).toBe(4);
  });
});
