import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import { createMockField } from "metabase-types/api/mocks";

import { type SetupOpts, setup as baseSetup } from "./setup";

function setup(opts: Partial<SetupOpts> = {}) {
  return baseSetup({
    ...opts,
    tokenFeatures: { whitelabel: true },
    enterprisePlugins: ["whitelabel"],
  });
}

describe("ValuesSourceModal", () => {
  const field1 = createMockField({
    id: 1,
    base_type: "type/Text",
    semantic_type: "type/Category",
  });

  describe("list source", () => {
    it("should render a hint about using models when labels are used", async () => {
      await setup({
        showMetabaseLinks: true,
        parameter: createMockUiParameter({
          fields: [field1],
          values_source_type: "static-list",
          values_source_config: {
            values: [["Gadget", "Label"], ["Widget"]],
          },
        }),
      });

      await userEvent.click(
        screen.getByRole("radio", { name: "From connected fields" }),
      );
      await userEvent.click(screen.getByRole("radio", { name: "Custom list" }));

      expect(screen.getByRole("textbox")).toHaveValue("Gadget, Label\nWidget");
      expect(screen.getByText("do it once in a model")).toBeInTheDocument();
      expect(screen.getByText("do it once in a model").tagName).toBe("A");
    });

    it("should render a hint about using models when labels are used, but without link when `show-metabase-links: false`", async () => {
      await setup({
        showMetabaseLinks: false,
        parameter: createMockUiParameter({
          fields: [field1],
          values_source_type: "static-list",
          values_source_config: {
            values: [["Gadget", "Label"], ["Widget"]],
          },
        }),
      });

      await userEvent.click(
        screen.getByRole("radio", { name: "From connected fields" }),
      );
      await userEvent.click(screen.getByRole("radio", { name: "Custom list" }));

      expect(screen.getByRole("textbox")).toHaveValue("Gadget, Label\nWidget");
      expect(screen.getByText("do it once in a model")).toBeInTheDocument();
      expect(screen.getByText("do it once in a model").tagName).not.toBe("A");
    });
  });
});
