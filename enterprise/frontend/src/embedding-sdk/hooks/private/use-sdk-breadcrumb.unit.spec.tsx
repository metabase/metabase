import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { SdkBreadcrumbProvider } from "embedding-sdk/components/private/Breadcrumb";

import { useSdkBreadcrumb } from "./use-sdk-breadcrumb";

const wrapper = ({ children }: { children: ReactNode }) => (
  <SdkBreadcrumbProvider>{children}</SdkBreadcrumbProvider>
);

describe("useSdkBreadcrumb", () => {
  it("should work without breadcrumb provider", () => {
    const { result } = renderHook(() => useSdkBreadcrumb());

    expect(result.current.isBreadcrumbEnabled).toBe(false);
    expect(result.current.breadcrumbs).toEqual([]);
    expect(result.current.currentLocation).toBe(null);
  });

  it("should work with breadcrumb provider", () => {
    const { result } = renderHook(() => useSdkBreadcrumb(), { wrapper });

    expect(result.current.isBreadcrumbEnabled).toBe(true);
    expect(result.current.breadcrumbs).toEqual([]);
    expect(result.current.currentLocation).toBe(null);
  });
});
