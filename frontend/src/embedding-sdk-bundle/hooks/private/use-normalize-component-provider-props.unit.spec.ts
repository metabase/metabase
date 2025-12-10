import type { ComponentProviderInternalProps } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { useSdkSelector } from "embedding-sdk-bundle/store";

import { useNormalizeComponentProviderProps } from "./use-normalize-component-provider-props";

jest.mock("embedding-sdk-bundle/store", () => ({
  useSdkSelector: jest.fn(),
}));

const mockUseSdkSelector = useSdkSelector as jest.Mock;

const BASE_PROPS = {
  authConfig: { uri: "http://localhost" },
} as unknown as ComponentProviderInternalProps;

const FULL_THEME = {
  preset: "light" as const,
  colors: { brand: "#ff0000" },
};

describe("useNormalizeComponentProviderProps", () => {
  describe("when embedding SDK feature is enabled", () => {
    beforeEach(() => {
      mockUseSdkSelector.mockReturnValue(true);
    });

    it("returns props unchanged", () => {
      const props = {
        ...BASE_PROPS,
        locale: "de",
        theme: FULL_THEME,
        allowConsoleLog: false,
      };

      expect(useNormalizeComponentProviderProps(props)).toEqual(props);
    });

    it.each([
      { locale: "fr" },
      { theme: { preset: "dark" as const } },
      { theme: { colors: { brand: "#00ff00" } } },
      { pluginsConfig: { mapQuestionClickActions: () => [] } },
    ])("preserves %p", (extraProps) => {
      const props = { ...BASE_PROPS, ...extraProps };

      expect(useNormalizeComponentProviderProps(props)).toEqual(props);
    });
  });

  describe("when embedding SDK feature is disabled (OSS)", () => {
    beforeEach(() => {
      mockUseSdkSelector.mockReturnValue(false);
    });

    it("removes locale from props", () => {
      const props = { ...BASE_PROPS, locale: "de" };

      const result = useNormalizeComponentProviderProps(props);

      expect(result.locale).toBeUndefined();
      expect(result.authConfig).toEqual(BASE_PROPS.authConfig);
    });

    it("keeps only preset when theme has preset", () => {
      const props = { ...BASE_PROPS, theme: FULL_THEME };

      const result = useNormalizeComponentProviderProps(props);

      expect(result.theme).toEqual({ preset: "light" });
    });

    it("strips all theme properties when no preset exists", () => {
      const themeWithoutPreset = { colors: { brand: "#ff0000" } };
      const props = { ...BASE_PROPS, theme: themeWithoutPreset };

      const result = useNormalizeComponentProviderProps(props);

      expect(result.theme).toEqual({});
    });

    it.each(["pluginsConfig", "eventHandlers", "allowConsoleLog"] as const)(
      "preserves %s prop",
      (propName) => {
        const props = { ...BASE_PROPS, [propName]: "test-value" };

        const result = useNormalizeComponentProviderProps(props);

        expect(result[propName]).toBe("test-value");
      },
    );
  });
});
