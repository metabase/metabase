import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import * as transformsUtils from "metabase-enterprise/transforms/utils";
import type { DraftTransformSource } from "metabase-types/api";
import { createMockTransform } from "metabase-types/api/mocks";

import { TransformPaneHeaderActions } from "./TransformPaneHeaderActions";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

const mockQuerySource: DraftTransformSource = {
  type: "query",
  query: {
    database: 1,
    type: "query",
    query: {
      "source-table": 1,
    },
  },
};

const mockPythonSource: DraftTransformSource = {
  type: "python",
  body: "# Python script",
  "source-database": 1,
  "source-tables": {},
};

type SetupOpts = {
  isDirty?: boolean;
  isEditMode?: boolean;
  isSaving?: boolean;
  source?: DraftTransformSource;
  isNative?: boolean;
  isPython?: boolean;
};

function setup({
  isDirty = false,
  isEditMode = false,
  isSaving = false,
  source = mockQuerySource,
  isNative = false,
  isPython = false,
}: SetupOpts = {}) {
  const handleCancel = jest.fn();
  const handleSave = jest.fn().mockResolvedValue(undefined);

  const nativeSource: DraftTransformSource = {
    type: "query",
    query: {
      database: 1,
      type: "native",
      native: { query: "SELECT * FROM table" },
    },
  };

  const resolvedSource = isPython
    ? mockPythonSource
    : isNative
      ? nativeSource
      : source;

  const transform = createMockTransform({
    id: 1,
    source_type: isPython ? "python" : isNative ? "native" : "mbql",
  });

  const { unmount } = renderWithProviders(
    <Route
      component={() => (
        <TransformPaneHeaderActions
          handleCancel={handleCancel}
          handleSave={handleSave}
          isDirty={isDirty}
          isEditMode={isEditMode}
          isSaving={isSaving}
          source={resolvedSource}
          transform={transform}
        />
      )}
      path="/"
    />,
    {
      withRouter: true,
      initialRoute: "/",
    },
  );

  return { handleCancel, handleSave, unmount };
}

describe("TransformPaneHeaderActions", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe("edit mode", () => {
    it("should render Save and Cancel", () => {
      setup({ isEditMode: true, isDirty: true });

      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /cancel/i }),
      ).toBeInTheDocument();
    });

    it("should not render EditDefinitionButton", () => {
      setup({ isEditMode: true });
      expect(
        screen.queryByRole("link", { name: /edit definition/i }),
      ).not.toBeInTheDocument();
    });

    describe("button states", () => {
      const mockValidationResult = (isValid: boolean) => {
        jest.spyOn(transformsUtils, "getValidationResult").mockReturnValue({
          isValid,
        });
      };

      it("should disable Save button when not dirty", () => {
        mockValidationResult(true);
        setup({ isEditMode: true, isDirty: false });
        expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
      });

      it("should enable Save button when dirty", () => {
        mockValidationResult(true);
        setup({ isEditMode: true, isDirty: true });
        expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
      });

      it("should disable Save button when saving", () => {
        mockValidationResult(true);
        setup({ isEditMode: true, isDirty: true, isSaving: true });
        expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
      });

      it("should disable Save button when query is invalid", () => {
        mockValidationResult(false);
        setup({ isEditMode: true, isDirty: true });
        expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
      });
    });
  });

  describe("read-only mode (not edit mode)", () => {
    it("should not render Save and Cancel", () => {
      setup({ isEditMode: false, isNative: true });

      expect(
        screen.queryByRole("button", { name: /cancel/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /save/i }),
      ).not.toBeInTheDocument();
    });

    it("should render nothing for native transforms when workspaces not available", () => {
      setup({ isEditMode: false, isNative: true });

      expect(
        screen.queryByRole("button", { name: /save/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /cancel/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /edit definition/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /edit/i }),
      ).not.toBeInTheDocument();
    });

    it("should render EditDefinitionButton for MBQL transforms", () => {
      setup({ isEditMode: false, isNative: false });

      expect(
        screen.getByRole("link", { name: /edit definition/i }),
      ).toBeInTheDocument();
    });

    describe("workspaces feature availability", () => {
      it("should render EditDefinitionButton when workspaces feature is not available", () => {
        setup({ isEditMode: false, isNative: false });

        expect(
          screen.getByRole("link", { name: /edit definition/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Python transforms", () => {
    it("should not render EditDefinitionButton for Python transforms (moved to EditTransformMenu in header)", () => {
      setup({ isEditMode: false, isPython: true });
      expect(
        screen.queryByRole("link", { name: /edit definition/i }),
      ).not.toBeInTheDocument();
    });

    it("should render Save and Cancel in edit mode for Python transforms", () => {
      setup({ isEditMode: true, isPython: true, isDirty: true });
      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /cancel/i }),
      ).toBeInTheDocument();
    });
  });
});
