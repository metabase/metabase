import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { EnterpriseSettings } from "metabase-enterprise/settings/types";

import type { StringSetting } from "./IllustrationWidget";
import { IllustrationWidget } from "./IllustrationWidget";

interface SetupOpts {
  setting: StringSetting;
  settingValues: Partial<
    Pick<
      EnterpriseSettings,
      | "login-page-illustration-custom"
      | "landing-page-illustration-custom"
      | "no-data-illustration-custom"
      | "no-object-illustration-custom"
    >
  >;
  type: "background" | "icon";
  customIllustrationSetting:
    | "login-page-illustration-custom"
    | "landing-page-illustration-custom"
    | "no-data-illustration-custom"
    | "no-object-illustration-custom";
}
function setup({
  setting,
  settingValues,
  type,
  customIllustrationSetting,
}: SetupOpts) {
  const onChange = jest.fn();
  const onChangeSetting = jest.fn();
  renderWithProviders(
    <IllustrationWidget
      setting={setting}
      onChange={onChange}
      onChangeSetting={onChangeSetting}
      settingValues={settingValues}
      customIllustrationSetting={customIllustrationSetting}
      errorMessageContainerId="does-not-matter-in-unit-tests"
      type={type}
    />,
  );

  return { onChange, onChangeSetting };
}

describe("IllustrationWidget", () => {
  const defaultSetting = {
    key: "login-page-illustration",
    value: null,
    default: "default",
  } as const;
  const customIllustrationSetting = "login-page-illustration-custom";
  const defaultSettingValues = {
    [customIllustrationSetting]: "",
  };
  const defaultIllustrationLabel = "Lighthouse";
  const defaultType = "background";

  describe("select options", () => {
    it("should render default value", () => {
      setup({
        setting: defaultSetting,
        settingValues: defaultSettingValues,
        type: defaultType,
        customIllustrationSetting,
      });
      expect(
        screen.getByDisplayValue(defaultIllustrationLabel),
      ).toBeInTheDocument();
    });

    it("should render options", async () => {
      setup({
        setting: defaultSetting,
        settingValues: defaultSettingValues,
        type: defaultType,
        customIllustrationSetting,
      });
      await userEvent.click(screen.getByRole("searchbox"));
      expect(screen.getByText(defaultIllustrationLabel)).toBeInTheDocument();
      expect(screen.getByText("No illustration")).toBeInTheDocument();
      expect(screen.getByText("Custom")).toBeInTheDocument();
    });

    it("should allow setting 'No illustration' option", async () => {
      const noIllustrationOption = {
        label: "No illustration",
        value: "none",
      };

      const { onChange } = setup({
        setting: defaultSetting,
        settingValues: defaultSettingValues,
        type: defaultType,
        customIllustrationSetting,
      });
      await userEvent.click(screen.getByRole("searchbox"));
      await userEvent.click(screen.getByText(noIllustrationOption.label));
      expect(onChange).toHaveBeenCalledWith(noIllustrationOption.value);
    });

    it("should not set anything after selecting 'Custom' option, but not uploading any file", async () => {
      const customOption = { label: "Custom", value: "custom" };

      const { onChange } = setup({
        setting: defaultSetting,
        settingValues: defaultSettingValues,
        type: defaultType,
        customIllustrationSetting,
      });
      await userEvent.click(screen.getByRole("searchbox"));
      await userEvent.click(screen.getByText(customOption.label));
      expect(onChange).not.toHaveBeenCalled();
    });

    /**
     * We couldn't test uploading an image because it relies on image.onerror and image.onload
     * which don't seem to be supported by jsdom. However the file upload test cases has already
     * been covered in E2E tests.
     */

    it("should not remove the custom uploaded image after changing the option to 'No illustration'", async () => {
      const noIllustrationOption = {
        label: "No illustration",
        value: "none",
      };
      const setting = {
        ...defaultSetting,
        value: "custom",
      } as const;

      const settingValues = {
        [customIllustrationSetting]: "some-image-url",
      };

      const { onChange, onChangeSetting } = setup({
        setting,
        settingValues,
        type: defaultType,
        customIllustrationSetting,
      });

      await userEvent.click(screen.getByRole("searchbox"));
      await userEvent.click(screen.getByText(noIllustrationOption.label));

      expect(onChange).toHaveBeenCalledWith(noIllustrationOption.value);
      expect(onChangeSetting).not.toHaveBeenCalled();
    });

    it("should not remove the custom uploaded image after changing the option to the default option", async () => {
      const defaultOption = {
        label: "Lighthouse",
        value: "default",
      };
      const setting = {
        ...defaultSetting,
        value: "custom",
      } as const;

      const settingValues = {
        [customIllustrationSetting]: "some-image-url",
      };

      const { onChange, onChangeSetting } = setup({
        setting,
        settingValues,
        type: defaultType,
        customIllustrationSetting,
      });

      await userEvent.click(screen.getByRole("searchbox"));
      await userEvent.click(screen.getByText(defaultOption.label));

      expect(onChange).toHaveBeenCalledWith(defaultOption.value);
      expect(onChangeSetting).not.toHaveBeenCalled();
    });

    it("should remove the custom uploaded image when clicking the remove button", async () => {
      const setting = {
        ...defaultSetting,
        value: "custom",
      } as const;

      const settingValues = {
        [customIllustrationSetting]: "some-image-url",
      };

      const { onChange, onChangeSetting } = setup({
        setting,
        settingValues,
        type: defaultType,
        customIllustrationSetting,
      });

      await userEvent.click(screen.getByLabelText("close icon"));

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith("default");
      });
      expect(onChangeSetting).toHaveBeenCalledWith(
        customIllustrationSetting,
        null,
      );
    });
  });

  describe("select the same option twice", () => {
    it("should not call callbacks when selecting the default option twice", async () => {
      const { onChange, onChangeSetting } = setup({
        setting: defaultSetting,
        settingValues: defaultSettingValues,
        type: defaultType,
        customIllustrationSetting,
      });

      await userEvent.click(screen.getByRole("searchbox"));
      await userEvent.click(screen.getByText(defaultIllustrationLabel));
      expect(
        screen.queryByText(defaultIllustrationLabel),
      ).not.toBeInTheDocument();

      expect(onChange).not.toHaveBeenCalled();
      expect(onChangeSetting).not.toHaveBeenCalled();
    });

    it("should not call callbacks when selecting 'No illustration' option twice", async () => {
      const setting = {
        ...defaultSetting,
        value: "none",
      } as const;
      const { onChange, onChangeSetting } = setup({
        setting,
        settingValues: defaultSettingValues,
        type: defaultType,
        customIllustrationSetting,
      });

      await userEvent.click(screen.getByRole("searchbox"));
      await userEvent.click(screen.getByText("No illustration"));
      expect(screen.queryByText("No illustration")).not.toBeInTheDocument();

      expect(onChange).not.toHaveBeenCalled();
      expect(onChangeSetting).not.toHaveBeenCalled();
    });

    it("should not call callbacks when selecting 'Custom' option twice", async () => {
      const setting = {
        ...defaultSetting,
        value: "custom",
      } as const;
      const { onChange, onChangeSetting } = setup({
        setting,
        settingValues: defaultSettingValues,
        type: defaultType,
        customIllustrationSetting,
      });

      await userEvent.click(screen.getByRole("searchbox"));
      await userEvent.click(screen.getByText("Custom"));
      expect(screen.queryByText("Custom")).not.toBeInTheDocument();

      expect(onChange).not.toHaveBeenCalled();
      expect(onChangeSetting).not.toHaveBeenCalled();
    });
  });
});
