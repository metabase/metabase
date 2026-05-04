import { renderHook } from "@testing-library/react";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { useLocale } from "metabase/common/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

import {
  useSetupAuthContentTranslations,
  useSetupContentTranslations,
} from "./use-setup-content-translations";

jest.mock("embedding-sdk-bundle/store", () => ({
  useSdkSelector: jest.fn(),
}));

jest.mock("metabase/common/hooks", () => ({
  useLocale: jest.fn(),
}));

jest.mock("metabase/plugins", () => ({
  PLUGIN_CONTENT_TRANSLATION: {
    setEndpointsForAuthEmbedding: jest.fn(),
    setEndpointsForStaticEmbedding: jest.fn(),
  },
}));

const mockUseSdkSelector = useSdkSelector as unknown as jest.Mock;
const mockUseLocale = useLocale as jest.Mock;
const mockSetEndpointsForAuthEmbedding =
  PLUGIN_CONTENT_TRANSLATION.setEndpointsForAuthEmbedding as jest.Mock;
const mockSetEndpointsForStaticEmbedding =
  PLUGIN_CONTENT_TRANSLATION.setEndpointsForStaticEmbedding as jest.Mock;

describe("useSetupAuthContentTranslations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not call setEndpointsForAuthEmbedding while isGuestEmbed is null (not yet known)", () => {
    mockUseLocale.mockReturnValue({ locale: "fr" });
    mockUseSdkSelector.mockReturnValue(null);

    renderHook(() => useSetupAuthContentTranslations());

    expect(mockSetEndpointsForAuthEmbedding).not.toHaveBeenCalled();
  });

  it("calls setEndpointsForAuthEmbedding when isGuestEmbed is explicitly false and locale is non-English", () => {
    mockUseLocale.mockReturnValue({ locale: "fr" });
    mockUseSdkSelector.mockReturnValue(false);

    renderHook(() => useSetupAuthContentTranslations());

    expect(mockSetEndpointsForAuthEmbedding).toHaveBeenCalledTimes(1);
  });

  it("does not call setEndpointsForAuthEmbedding when isGuestEmbed is true (guest embed)", () => {
    mockUseLocale.mockReturnValue({ locale: "fr" });
    mockUseSdkSelector.mockReturnValue(true);

    renderHook(() => useSetupAuthContentTranslations());

    expect(mockSetEndpointsForAuthEmbedding).not.toHaveBeenCalled();
  });

  it("does not call setEndpointsForAuthEmbedding when locale is English", () => {
    mockUseLocale.mockReturnValue({ locale: "en" });
    mockUseSdkSelector.mockReturnValue(false);

    renderHook(() => useSetupAuthContentTranslations());

    expect(mockSetEndpointsForAuthEmbedding).not.toHaveBeenCalled();
  });

  it("calls setEndpointsForAuthEmbedding only after isGuestEmbed transitions from null to false", () => {
    mockUseLocale.mockReturnValue({ locale: "fr" });
    mockUseSdkSelector.mockReturnValue(null);

    const { rerender } = renderHook(() => useSetupAuthContentTranslations());

    expect(mockSetEndpointsForAuthEmbedding).not.toHaveBeenCalled();

    mockUseSdkSelector.mockReturnValue(false);
    rerender();

    expect(mockSetEndpointsForAuthEmbedding).toHaveBeenCalledTimes(1);
  });

  it("never calls setEndpointsForAuthEmbedding when isGuestEmbed transitions from null to true (guest embed race)", () => {
    mockUseLocale.mockReturnValue({ locale: "fr" });
    mockUseSdkSelector.mockReturnValue(null);

    const { rerender } = renderHook(() => useSetupAuthContentTranslations());

    expect(mockSetEndpointsForAuthEmbedding).not.toHaveBeenCalled();

    mockUseSdkSelector.mockReturnValue(true);
    rerender();

    expect(mockSetEndpointsForAuthEmbedding).not.toHaveBeenCalled();
  });
});

describe("useSetupContentTranslations", () => {
  const token = "mock-jwt-token";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not call setEndpointsForStaticEmbedding while isGuestEmbed is null (not yet known)", () => {
    mockUseLocale.mockReturnValue({ locale: "fr" });
    mockUseSdkSelector.mockReturnValue(null);

    renderHook(() => useSetupContentTranslations({ token }));

    expect(mockSetEndpointsForStaticEmbedding).not.toHaveBeenCalled();
  });

  it("calls setEndpointsForStaticEmbedding with the token when isGuestEmbed is true and locale is non-English", () => {
    mockUseLocale.mockReturnValue({ locale: "fr" });
    mockUseSdkSelector.mockReturnValue(true);

    renderHook(() => useSetupContentTranslations({ token }));

    expect(mockSetEndpointsForStaticEmbedding).toHaveBeenCalledWith(token);
  });

  it("does not call setEndpointsForStaticEmbedding when token is null", () => {
    mockUseLocale.mockReturnValue({ locale: "fr" });
    mockUseSdkSelector.mockReturnValue(true);

    renderHook(() => useSetupContentTranslations({ token: null }));

    expect(mockSetEndpointsForStaticEmbedding).not.toHaveBeenCalled();
  });

  it("does not call setEndpointsForStaticEmbedding when locale is English", () => {
    mockUseLocale.mockReturnValue({ locale: "en" });
    mockUseSdkSelector.mockReturnValue(true);

    renderHook(() => useSetupContentTranslations({ token }));

    expect(mockSetEndpointsForStaticEmbedding).not.toHaveBeenCalled();
  });

  it("does not call setEndpointsForStaticEmbedding when isGuestEmbed is false (auth embed)", () => {
    mockUseLocale.mockReturnValue({ locale: "fr" });
    mockUseSdkSelector.mockReturnValue(false);

    renderHook(() => useSetupContentTranslations({ token }));

    expect(mockSetEndpointsForStaticEmbedding).not.toHaveBeenCalled();
  });
});
