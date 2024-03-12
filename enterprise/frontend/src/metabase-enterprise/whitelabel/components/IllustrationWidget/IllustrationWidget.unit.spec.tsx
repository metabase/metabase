import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import type { StringSetting } from "./IllustrationWidget";
import { IllustrationWidget } from "./IllustrationWidget";

interface SetupOpts {
  setting: StringSetting;
  defaultIllustrationLabel: string;
  customIllustrationSetting:
    | "login-page-illustration-custom"
    | "landing-page-illustration-custom"
    | "no-question-results-illustration-custom"
    | "no-search-results-illustration-custom";
}
function setup({
  setting,
  defaultIllustrationLabel,
  customIllustrationSetting,
}: SetupOpts) {
  const onChange = jest.fn();
  const onChangeSetting = jest.fn();
  renderWithProviders(
    <IllustrationWidget
      setting={setting}
      onChange={onChange}
      onChangeSetting={onChangeSetting}
      settingValues={{}}
      defaultIllustrationLabel={defaultIllustrationLabel}
      customIllustrationSetting={customIllustrationSetting}
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
  const defaultIllustrationLabel = "Lighthouse";
  const customIllustrationSetting = "login-page-illustration-custom";

  describe("select options", () => {
    it("should render default value", () => {
      setup({
        setting: defaultSetting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });
      expect(
        screen.getByDisplayValue(defaultIllustrationLabel),
      ).toBeInTheDocument();
    });

    it("should render options", () => {
      setup({
        setting: defaultSetting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });
      userEvent.click(screen.getByRole("searchbox"));
      expect(screen.getByText(defaultIllustrationLabel)).toBeInTheDocument();
      expect(screen.getByText("No illustration")).toBeInTheDocument();
      expect(screen.getByText("Custom")).toBeInTheDocument();
    });

    it("should allow setting 'No illustration' option", () => {
      const noIllustrationOption = {
        label: "No illustration",
        value: "no-illustration",
      };

      const { onChange } = setup({
        setting: defaultSetting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });
      userEvent.click(screen.getByRole("searchbox"));
      userEvent.click(screen.getByText(noIllustrationOption.label));
      expect(onChange).toHaveBeenCalledWith(noIllustrationOption.value);
    });

    it("should not set anything after selecting 'Custom' option, but not uploading any file", () => {
      const customOption = { label: "Custom", value: "custom" };

      const { onChange } = setup({
        setting: defaultSetting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });
      userEvent.click(screen.getByRole("searchbox"));
      userEvent.click(screen.getByText(customOption.label));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should allow uploading a PNG file", async () => {
      /**
       * Since `userEvent.upload` seem to bypass input's `accept` which accepts MIME types,
       * we wouldn't be able to test that we shouldn't be able to select files with MIME type
       * not specified in `accept`.
       */
      const customOption = { label: "Custom", value: "custom" };

      const { onChange, onChangeSetting } = setup({
        setting: defaultSetting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });

      userEvent.click(screen.getByRole("searchbox"));
      userEvent.click(screen.getByText(customOption.label));

      const file = new File(["hello"], "hello.png", { type: "image/png" });
      const input = screen.getByTestId("file-input");
      userEvent.upload(input, file);
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(customOption.value);
      });
      expect(onChangeSetting).toHaveBeenCalledWith(
        customIllustrationSetting,
        expect.stringMatching(/^data:image\/png;base64,/),
      );
    });

    it("should not remove the custom uploaded image after changing the option to 'No illustration'", async () => {
      const noIllustrationOption = {
        label: "No illustration",
        value: "no-illustration",
      };
      const setting = {
        ...defaultSetting,
        value: "custom",
      } as const;

      const { onChange, onChangeSetting } = setup({
        setting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });

      userEvent.click(screen.getByRole("searchbox"));
      userEvent.click(screen.getByText(noIllustrationOption.label));

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

      const { onChange, onChangeSetting } = setup({
        setting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });

      userEvent.click(screen.getByRole("searchbox"));
      userEvent.click(screen.getByText(defaultOption.label));

      expect(onChange).toHaveBeenCalledWith(defaultOption.value);
      expect(onChangeSetting).not.toHaveBeenCalled();
    });

    it("should remove the custom uploaded image when clicking the remove button", async () => {
      const setting = {
        ...defaultSetting,
        value: "custom",
      } as const;

      const { onChange, onChangeSetting } = setup({
        setting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });

      userEvent.click(screen.getByLabelText("close icon"));

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
    it("should not call callbacks when selecting the default option twice", () => {
      const { onChange, onChangeSetting } = setup({
        setting: defaultSetting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });

      userEvent.click(screen.getByRole("searchbox"));
      userEvent.click(screen.getByText(defaultIllustrationLabel));
      expect(
        screen.queryByText(defaultIllustrationLabel),
      ).not.toBeInTheDocument();

      expect(onChange).not.toHaveBeenCalled();
      expect(onChangeSetting).not.toHaveBeenCalled();
    });

    it("should not call callbacks when selecting 'No illustration' option twice", () => {
      const setting = {
        ...defaultSetting,
        value: "no-illustration",
      } as const;
      const { onChange, onChangeSetting } = setup({
        setting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });

      userEvent.click(screen.getByRole("searchbox"));
      userEvent.click(screen.getByText("No illustration"));
      expect(screen.queryByText("No illustration")).not.toBeInTheDocument();

      expect(onChange).not.toHaveBeenCalled();
      expect(onChangeSetting).not.toHaveBeenCalled();
    });

    it("should not call callbacks when selecting 'Custom' option twice", () => {
      const setting = {
        ...defaultSetting,
        value: "custom",
      } as const;
      const { onChange, onChangeSetting } = setup({
        setting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });

      userEvent.click(screen.getByRole("searchbox"));
      userEvent.click(screen.getByText("Custom"));
      expect(screen.queryByText("Custom")).not.toBeInTheDocument();

      expect(onChange).not.toHaveBeenCalled();
      expect(onChangeSetting).not.toHaveBeenCalled();
    });
  });
});
