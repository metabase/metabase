import { act, renderHook } from "@testing-library/react";

import type { DashboardSharingModalType } from "metabase/embedding/components/SharingMenu/types";
import {
  GUEST_EMBED_EMBEDDING_TYPE,
  STATIC_LEGACY_EMBEDDING_TYPE,
} from "metabase/embedding/constants";
import { setOpenModal } from "metabase/redux/ui";
import type { Dashboard } from "metabase-types/api";

import { useSharingModal } from "./use-sharing-modal";

const mockDispatch = jest.fn();
const mockOpenEmbedJsWizard = jest.fn();

jest.mock("metabase/lib/redux", () => ({
  useDispatch: () => mockDispatch,
}));

jest.mock("metabase/embedding/hooks/use-open-embed-js-wizard", () => ({
  useOpenEmbedJsWizard: () => mockOpenEmbedJsWizard,
}));

const mockResource = { id: 1 } as Dashboard;
const mockResourceType = "dashboard" as const;

describe("useSharingModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should initialize with null modalType", () => {
    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>({
        resource: mockResource,
        resourceType: mockResourceType,
      }),
    );

    expect(result.current.modalType).toBeNull();
  });

  it("should set modalType for STATIC_LEGACY_EMBEDDING_TYPE", () => {
    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>({
        resource: mockResource,
        resourceType: mockResourceType,
      }),
    );

    act(() => {
      result.current.setModalType(STATIC_LEGACY_EMBEDDING_TYPE);
    });

    expect(result.current.modalType).toBe(STATIC_LEGACY_EMBEDDING_TYPE);
  });

  it("should dispatch setOpenModal(null) when clearing modalType", () => {
    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>({
        resource: mockResource,
        resourceType: mockResourceType,
      }),
    );

    act(() => {
      result.current.setModalType(STATIC_LEGACY_EMBEDDING_TYPE);
    });

    act(() => {
      result.current.setModalType(null);
    });

    expect(result.current.modalType).toBeNull();
    expect(mockDispatch).toHaveBeenCalledWith(setOpenModal(null));
  });

  it("should call openEmbedJsWizard when setting GUEST_EMBED_EMBEDDING_TYPE", () => {
    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>({
        resource: mockResource,
        resourceType: mockResourceType,
      }),
    );

    act(() => {
      result.current.setModalType(GUEST_EMBED_EMBEDDING_TYPE);
    });

    expect(mockOpenEmbedJsWizard).toHaveBeenCalledWith({
      onBeforeOpen: expect.any(Function),
    });
  });

  it("should clear modalType before opening EmbedJS wizard", () => {
    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>({
        resource: mockResource,
        resourceType: mockResourceType,
      }),
    );

    act(() => {
      result.current.setModalType(STATIC_LEGACY_EMBEDDING_TYPE);
    });

    expect(result.current.modalType).toBe(STATIC_LEGACY_EMBEDDING_TYPE);

    act(() => {
      result.current.setModalType(GUEST_EMBED_EMBEDDING_TYPE);
    });

    // Extract and call the onBeforeOpen callback
    const onBeforeOpenCallback = mockOpenEmbedJsWizard.mock.calls[0][0]
      .onBeforeOpen as () => void;

    act(() => {
      onBeforeOpenCallback();
    });

    expect(result.current.modalType).toBeNull();
  });

  it("should update modalType when switching between different modal types", () => {
    const { result } = renderHook(() =>
      useSharingModal<DashboardSharingModalType>({
        resource: mockResource,
        resourceType: mockResourceType,
      }),
    );

    act(() => {
      result.current.setModalType(STATIC_LEGACY_EMBEDDING_TYPE);
    });

    expect(result.current.modalType).toBe(STATIC_LEGACY_EMBEDDING_TYPE);

    act(() => {
      result.current.setModalType("public-link" as DashboardSharingModalType);
    });

    expect(result.current.modalType).toBe("public-link");
  });
});
