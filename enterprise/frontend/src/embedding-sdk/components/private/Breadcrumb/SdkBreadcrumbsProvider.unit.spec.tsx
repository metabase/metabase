import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { useSdkBreadcrumb } from "embedding-sdk/hooks/private/use-sdk-breadcrumb";

import { SdkBreadcrumbsProvider } from "./SdkBreadcrumbsProvider";

const wrapper = ({ children }: { children: ReactNode }) => (
  <SdkBreadcrumbsProvider>{children}</SdkBreadcrumbsProvider>
);

describe("SdkBreadcrumbsProvider", () => {
  it("should initialize with empty breadcrumbs", () => {
    const { result } = renderHook(() => useSdkBreadcrumb(), { wrapper });

    expect(result.current.isBreadcrumbEnabled).toBe(true);
    expect(result.current.breadcrumbs).toEqual([]);
    expect(result.current.currentLocation).toBe(null);
  });

  it("should add items to breadcrumb stack and update currentLocation", () => {
    const { result } = renderHook(() => useSdkBreadcrumb(), { wrapper });

    act(() => {
      result.current.reportLocation({
        type: "collection",
        id: "root",
        name: "Root Collection",
      });
    });

    expect(result.current.breadcrumbs).toHaveLength(1);
    expect(result.current.breadcrumbs[0]).toEqual({
      type: "collection",
      id: "root",
      name: "Root Collection",
    });
    // currentLocation should be the last item in breadcrumbs
    expect(result.current.currentLocation).toEqual({
      type: "collection",
      id: "root",
      name: "Root Collection",
    });
  });

  it("should append collections to build hierarchy", () => {
    const { result } = renderHook(() => useSdkBreadcrumb(), { wrapper });

    act(() => {
      result.current.reportLocation({
        type: "collection",
        id: "1",
        name: "Collection 1",
      });
    });

    act(() => {
      result.current.reportLocation({
        type: "collection",
        id: "2",
        name: "Collection 2",
      });
    });

    expect(result.current.breadcrumbs).toHaveLength(2);
    expect(result.current.breadcrumbs[0]).toEqual({
      type: "collection",
      id: "1",
      name: "Collection 1",
    });
    expect(result.current.breadcrumbs[1]).toEqual({
      type: "collection",
      id: "2",
      name: "Collection 2",
    });
    // currentLocation should be the last collection
    expect(result.current.currentLocation).toEqual({
      type: "collection",
      id: "2",
      name: "Collection 2",
    });
  });

  it("should append different type items", () => {
    const { result } = renderHook(() => useSdkBreadcrumb(), { wrapper });

    act(() => {
      result.current.reportLocation({
        type: "collection",
        id: "1",
        name: "Collection 1",
      });
    });

    act(() => {
      result.current.reportLocation({
        type: "question",
        id: 123,
        name: "My Question",
      });
    });

    expect(result.current.breadcrumbs).toHaveLength(2);
    expect(result.current.breadcrumbs[0]).toEqual({
      type: "collection",
      id: "1",
      name: "Collection 1",
    });
    expect(result.current.breadcrumbs[1]).toEqual({
      type: "question",
      id: 123,
      name: "My Question",
    });
  });

  it("should handle navigation by popping stack", () => {
    const { result } = renderHook(() => useSdkBreadcrumb(), { wrapper });

    // Build up a stack
    act(() => {
      result.current.reportLocation({
        type: "collection",
        id: "1",
        name: "Collection 1",
      });
    });

    act(() => {
      result.current.reportLocation({
        type: "question",
        id: 123,
        name: "My Question",
      });
    });

    act(() => {
      result.current.reportLocation({
        type: "dashboard",
        id: 456,
        name: "My Dashboard",
      });
    });

    expect(result.current.breadcrumbs).toHaveLength(3);

    // Navigate back to collection
    act(() => {
      result.current.navigateTo({
        type: "collection",
        id: "1",
        name: "Collection 1",
      });
    });

    expect(result.current.breadcrumbs).toHaveLength(1);
    expect(result.current.currentLocation).toEqual({
      type: "collection",
      id: "1",
      name: "Collection 1",
    });
  });

  it("should replace question with question", () => {
    const { result } = renderHook(() => useSdkBreadcrumb(), { wrapper });

    act(() => {
      result.current.reportLocation({
        type: "collection",
        id: "1",
        name: "Collection 1",
      });
    });

    act(() => {
      result.current.reportLocation({
        type: "question",
        id: 123,
        name: "Question 1",
      });
    });

    act(() => {
      result.current.reportLocation({
        type: "question",
        id: 456,
        name: "Question 2",
      });
    });

    expect(result.current.breadcrumbs).toHaveLength(2);
    expect(result.current.breadcrumbs[1]).toEqual({
      type: "question",
      id: 456,
      name: "Question 2",
    });
  });

  it("should handle duplicate collections by truncating", () => {
    const { result } = renderHook(() => useSdkBreadcrumb(), { wrapper });

    // Build hierarchy: Collection 1 > Collection 2 > Collection 3
    act(() => {
      result.current.reportLocation({
        type: "collection",
        id: "1",
        name: "Collection 1",
      });
    });

    act(() => {
      result.current.reportLocation({
        type: "collection",
        id: "2",
        name: "Collection 2",
      });
    });

    act(() => {
      result.current.reportLocation({
        type: "collection",
        id: "3",
        name: "Collection 3",
      });
    });

    expect(result.current.breadcrumbs).toHaveLength(3);

    // Go back to Collection 1 (should truncate to just Collection 1)
    act(() => {
      result.current.reportLocation({
        type: "collection",
        id: "1",
        name: "Collection 1",
      });
    });

    expect(result.current.breadcrumbs).toHaveLength(1);
    expect(result.current.breadcrumbs[0]).toEqual({
      type: "collection",
      id: "1",
      name: "Collection 1",
    });
  });
});
