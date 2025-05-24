import userEvent from "@testing-library/user-event";
import type { JSX } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  DictionaryResponse,
  RowValue,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { PRODUCT_CATEGORY_VALUES } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { ListField } from "./ListField";
import { portugueseDictionary } from "./test-constants";
import type { Option } from "./types";

type SetupOpts = {
  value?: RowValue[];
  options?: Option[];
  optionRenderer?: (option: Option) => JSX.Element;
  placeholder?: string;
  checkedColor?: string;
  isDashboardFilter?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  locale?: string;
  contentTranslationDictionary?: DictionaryResponse["data"];
};

function setup({
  value = [],
  options = [],
  optionRenderer = ([value]) => <>{value}</>,
  placeholder = "Search the list",
  checkedColor,
  isDashboardFilter,
  hasEnterprisePlugins = false,
  tokenFeatures = {},
  locale = "en",
  contentTranslationDictionary,
}: SetupOpts) {
  const onChange = jest.fn();

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
    currentUser: createMockUser({ locale }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();

    if (!contentTranslationDictionary) {
      throw new Error("contentTranslationDictionary is required");
    }
    setupContentTranslationEndpoints({
      dictionary: contentTranslationDictionary,
    });
  }

  renderWithProviders(
    <ListField
      value={value}
      options={options}
      optionRenderer={optionRenderer}
      placeholder={placeholder}
      checkedColor={checkedColor}
      isDashboardFilter={isDashboardFilter}
      onChange={onChange}
    />,
    { storeInitialState: state },
  );

  return { onChange };
}

describe("ListField", () => {
  const allOptions = PRODUCT_CATEGORY_VALUES.values;
  const allValues = allOptions.map(([value]) => String(value));

  it("should allow to select all options", async () => {
    const { onChange } = setup({
      value: [],
      options: allOptions,
    });

    const checkbox = screen.getByLabelText("Select all");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(allValues);
  });

  it("should allow to select all options when some are selected", async () => {
    const { onChange } = setup({
      value: [allValues[0]],
      options: allOptions,
    });

    const checkbox = screen.getByLabelText("Select all");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(allValues);
  });

  it("should allow to select only visible options after search", async () => {
    const { onChange } = setup({
      value: ["Doohickey", "Gadget"],
      options: allOptions,
    });

    await userEvent.type(screen.getByPlaceholderText("Search the list"), "get");
    expect(screen.getByLabelText("Gadget")).toBeInTheDocument();
    expect(screen.getByLabelText("Widget")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByLabelText("Gizmo")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Doohickey")).not.toBeInTheDocument(),
    );

    const checkbox = screen.getByLabelText("Select these");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(["Doohickey", "Gadget", "Widget"]);
    expect(screen.getByLabelText("Gadget")).toBeChecked();
    expect(screen.getByLabelText("Widget")).toBeChecked();
  });

  it("should allow to deselect all options", async () => {
    const { onChange } = setup({
      value: allValues,
      options: allOptions,
    });

    const checkbox = screen.getByLabelText("Select all");
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("should allow to deselect all options after search", async () => {
    const { onChange } = setup({
      value: ["Doohickey", "Gadget", "Widget"],
      options: allOptions,
    });

    await userEvent.type(
      screen.getByPlaceholderText("Search the list"),
      "Gadget",
    );
    expect(screen.getByLabelText("Gadget")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByLabelText("Widget")).not.toBeInTheDocument(),
    );

    const checkbox = screen.getByLabelText("Select these");
    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(["Doohickey", "Widget"]);
    expect(screen.getByLabelText("Gadget")).not.toBeChecked();
  });

  it("should not show the toggle all checkbox when search results are empty", async () => {
    setup({
      value: [],
      options: allOptions,
    });
    await userEvent.type(
      screen.getByPlaceholderText("Search the list"),
      "Invalid",
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Select all")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Select all")).not.toBeInTheDocument(),
    );
  });

  describe("respects content translations", () => {
    const setupWithContentTranslation = () =>
      setup({
        value: ["Gadget", "Widget", "Gizmo", "Doohickey"],
        options: allOptions,
        locale: "pt_BR",
        hasEnterprisePlugins: true,
        tokenFeatures: {
          content_translation: true,
        },
        contentTranslationDictionary: portugueseDictionary,
      });

    it("in sorting", async () => {
      setupWithContentTranslation();

      await waitFor(async () => {
        expect(await screen.findByText("Aparelho")).toBeInTheDocument();
      });

      expect(await screen.findByText("Engenhoca")).toBeInTheDocument();
      expect(await screen.findByText("Treco")).toBeInTheDocument();
      expect(await screen.findByText("Dispositivo")).toBeInTheDocument();

      // Check the order of the options
      const options = screen.getAllByRole("checkbox");
      expect(options[0]).toHaveTextContent("Aparelho");
      expect(options[1]).toHaveTextContent("Engenhoca");
      expect(options[2]).toHaveTextContent("Treco");
      expect(options[3]).toHaveTextContent("Dispositivo");
    });
  });
});
