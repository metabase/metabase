import { act, renderHook } from "@testing-library/react";

import type { DashboardSharingModalType } from "metabase/embedding/components/SharingMenu/types";
import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { setOpenModal } from "metabase/redux/ui";

import { useSharingModal } from "./use-sharing-modal";

const mockDispatch = jest.fn();
const mockSelector = jest.fn();

jest.mock("metabase/lib/redux", () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => mockSelector(selector),
}));

describe("useSharingModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelector.mockReturnValue(null);
  });

  it("should initialize with null modalType", () => {
    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>(),
    );

    expect(result.current.modalType).toBeNull();
  });

  it("should set modalType when valid modal exists in Redux", () => {
    mockSelector.mockReturnValue(STATIC_LEGACY_EMBEDDING_TYPE);

    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>(),
    );

    expect(result.current.modalType).toBe(STATIC_LEGACY_EMBEDDING_TYPE);
  });

  it("should not set modalType for invalid modal values", () => {
    mockSelector.mockReturnValue("invalid-modal");

    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>(),
    );

    expect(result.current.modalType).toBeNull();
  });

  it("should update modalType when Redux modal changes from null to valid", () => {
    mockSelector.mockReturnValue(null);

    const { result, rerender } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>(),
    );

    expect(result.current.modalType).toBeNull();

    mockSelector.mockReturnValue(STATIC_LEGACY_EMBEDDING_TYPE);
    rerender();

    expect(result.current.modalType).toBe(STATIC_LEGACY_EMBEDDING_TYPE);
  });

  it("should persist modalType when Redux modal becomes null", () => {
    mockSelector.mockReturnValue(STATIC_LEGACY_EMBEDDING_TYPE);

    const { result, rerender } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>(),
    );

    expect(result.current.modalType).toBe(STATIC_LEGACY_EMBEDDING_TYPE);

    mockSelector.mockReturnValue(null);
    rerender();

    expect(result.current.modalType).toBe(STATIC_LEGACY_EMBEDDING_TYPE);
  });

  it("should allow manually setting modalType", () => {
    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>(),
    );

    act(() => {
      result.current.setModalType(STATIC_LEGACY_EMBEDDING_TYPE);
    });

    expect(result.current.modalType).toBe(STATIC_LEGACY_EMBEDDING_TYPE);
  });

  it("should dispatch setOpenModal(null) when clearing modalType", () => {
    mockSelector.mockReturnValue(STATIC_LEGACY_EMBEDDING_TYPE);

    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>(),
    );

    act(() => {
      result.current.setModalType(null);
    });

    expect(result.current.modalType).toBeNull();
    expect(mockDispatch).toHaveBeenCalledWith(setOpenModal(null));
  });

  it("should not dispatch when manually setting non-null modalType", () => {
    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>(),
    );

    act(() => {
      result.current.setModalType(STATIC_LEGACY_EMBEDDING_TYPE);
    });

    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
