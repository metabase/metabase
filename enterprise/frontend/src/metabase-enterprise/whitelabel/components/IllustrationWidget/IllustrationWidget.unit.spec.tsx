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
      const newOption = { label: "No illustration", value: "no-illustration" };

      const { onChange } = setup({
        setting: defaultSetting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });
      userEvent.click(screen.getByRole("searchbox"));
      userEvent.click(screen.getByText(newOption.label));
      expect(onChange).toHaveBeenCalledWith(newOption.value);
    });

    it("should not set anything after selecting 'Custom' option", () => {
      const newOption = { label: "Custom", value: "custom" };

      const { onChange } = setup({
        setting: defaultSetting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });
      userEvent.click(screen.getByRole("searchbox"));
      userEvent.click(screen.getByText(newOption.label));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should allow uploading PNG file", async () => {
      const newOption = { label: "Custom", value: "custom" };

      const { onChangeSetting } = setup({
        setting: defaultSetting,
        defaultIllustrationLabel,
        customIllustrationSetting,
      });

      userEvent.click(screen.getByRole("searchbox"));
      userEvent.click(screen.getByText(newOption.label));

      const file = new File(["hello"], "hello.png", { type: "image/png" });
      const input = screen.getByTestId("file-input");
      userEvent.upload(input, file);
      await waitFor(() => {
        expect(onChangeSetting).toHaveBeenCalledWith(
          customIllustrationSetting,
          // We'll modify the test once we don't save the value as data URL
          expect.stringMatching(/^data:image\/png;base64,/),
        );
      });
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
