import { renderHook } from "@testing-library/react";
import type { ReactElement } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { setCustomLoader } from "metabase/ui/components/feedback/Loader/Loader";

import { useSdkCustomLoader } from "./use-sdk-custom-loader";

jest.mock("embedding-sdk-shared/hooks/use-metabase-provider-props-store");
jest.mock("metabase/ui/components/feedback/Loader/Loader", () => ({
  setCustomLoader: jest.fn(),
}));

const mockUseMetabaseProviderPropsStore =
  useMetabaseProviderPropsStore as jest.Mock;
const mockSetCustomLoader = setCustomLoader as jest.Mock;

const MockLoaderComponent = () => <div>Custom Loader</div>;

const createMockStore = (loaderComponent?: () => ReactElement) => ({
  state: {
    props: {
      loaderComponent,
    },
  },
});

describe("useSdkCustomLoader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls setCustomLoader with undefined when no loader component is provided", () => {
    mockUseMetabaseProviderPropsStore.mockReturnValue(
      createMockStore(undefined),
    );

    renderHook(() => useSdkCustomLoader());

    expect(mockSetCustomLoader).toHaveBeenCalledWith(undefined);
  });

  it("calls setCustomLoader with the loader component when provided", () => {
    mockUseMetabaseProviderPropsStore.mockReturnValue(
      createMockStore(MockLoaderComponent),
    );

    renderHook(() => useSdkCustomLoader());

    expect(mockSetCustomLoader).toHaveBeenCalledWith(MockLoaderComponent);
  });

  it("calls setCustomLoader again when the loader component changes", () => {
    // Start with no loader component
    mockUseMetabaseProviderPropsStore.mockReturnValue(
      createMockStore(undefined),
    );

    const { rerender } = renderHook(() => useSdkCustomLoader());

    expect(mockSetCustomLoader).toHaveBeenCalledWith(undefined);
    expect(mockSetCustomLoader).toHaveBeenCalledTimes(1);

    // Change to a custom loader component
    const AnotherLoaderComponent = () => <div>Another Custom Loader</div>;
    mockUseMetabaseProviderPropsStore.mockReturnValue(
      createMockStore(AnotherLoaderComponent),
    );
    rerender();

    expect(mockSetCustomLoader).toHaveBeenCalledWith(AnotherLoaderComponent);
    expect(mockSetCustomLoader).toHaveBeenCalledTimes(2);
  });

  it("does not call setCustomLoader again when props haven't changed", () => {
    mockUseMetabaseProviderPropsStore.mockReturnValue(
      createMockStore(MockLoaderComponent),
    );

    const { rerender } = renderHook(() => useSdkCustomLoader());

    expect(mockSetCustomLoader).toHaveBeenCalledWith(MockLoaderComponent);

    rerender();

    // Should still be called only once since the loader component hasn't changed
    expect(mockSetCustomLoader).toHaveBeenCalledTimes(1);
  });

  it("handles null metabase provider props gracefully", () => {
    mockUseMetabaseProviderPropsStore.mockReturnValue({
      state: {
        props: null,
      },
    });

    renderHook(() => useSdkCustomLoader());

    expect(mockSetCustomLoader).toHaveBeenCalledWith(undefined);
  });

  it("calls setCustomLoader when loader component changes from defined to undefined", () => {
    // Start with a loader component
    mockUseMetabaseProviderPropsStore.mockReturnValue(
      createMockStore(MockLoaderComponent),
    );

    const { rerender } = renderHook(() => useSdkCustomLoader());

    expect(mockSetCustomLoader).toHaveBeenCalledWith(MockLoaderComponent);
    expect(mockSetCustomLoader).toHaveBeenCalledTimes(1);

    // Change to no loader component
    mockUseMetabaseProviderPropsStore.mockReturnValue(
      createMockStore(undefined),
    );
    rerender();

    expect(mockSetCustomLoader).toHaveBeenCalledWith(undefined);
    expect(mockSetCustomLoader).toHaveBeenCalledTimes(2);
  });

  it("calls setCustomLoader when switching between different loader components", () => {
    const FirstLoaderComponent = () => <div>First Loader</div>;
    const SecondLoaderComponent = () => <div>Second Loader</div>;

    // Start with first loader component
    mockUseMetabaseProviderPropsStore.mockReturnValue(
      createMockStore(FirstLoaderComponent),
    );

    const { rerender } = renderHook(() => useSdkCustomLoader());

    expect(mockSetCustomLoader).toHaveBeenCalledWith(FirstLoaderComponent);
    expect(mockSetCustomLoader).toHaveBeenCalledTimes(1);

    // Switch to second loader component
    mockUseMetabaseProviderPropsStore.mockReturnValue(
      createMockStore(SecondLoaderComponent),
    );
    rerender();

    expect(mockSetCustomLoader).toHaveBeenCalledWith(SecondLoaderComponent);
    expect(mockSetCustomLoader).toHaveBeenCalledTimes(2);
  });
});
