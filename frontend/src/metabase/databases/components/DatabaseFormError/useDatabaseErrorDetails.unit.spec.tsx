import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import {
  type FormProvidersOptions,
  TestFormErrorProvider,
} from "./test-utils/TestFormErrorProvider";
import { useDatabaseErrorDetails } from "./useDatabaseErrorDetails";

const setup = (opts: FormProvidersOptions) => {
  const { errorVariant, errorMessage } = opts;
  const FormProviderWrapper = ({ children }: PropsWithChildren) => (
    <TestFormErrorProvider
      errorVariant={errorVariant}
      errorMessage={errorMessage}
    >
      {children}
    </TestFormErrorProvider>
  );

  return renderHook(() => useDatabaseErrorDetails(), {
    wrapper: FormProviderWrapper,
    initialProps: {
      errorVariant,
      errorMessage,
    },
  });
};

describe("useDatabaseErrorDetails", () => {
  it("should return the correct error message when error variant is 'hostAndPort'", () => {
    const { result } = setup({
      errorVariant: "hostAndPort",
      errorMessage: "Random error message",
    });
    expect(result.current.errorMessage).toBe(
      "Make sure your Host and Port settings are correct.",
    );
    expect(result.current.isHostAndPortError).toBe(true);
  });

  it("should return the correct error message when error variant is 'generic'", () => {
    const { result } = setup({
      errorVariant: "generic",
      errorMessage: "Generic error message",
    });
    expect(result.current.errorMessage).toBe("Generic error message");
    expect(result.current.isHostAndPortError).toBe(false);
  });
});
