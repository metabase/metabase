import { screen } from "__support__/ui";
import { createMockParameter } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("DashCardParameterMapper > DisabledNativeCardHelpText (OSS)", () => {
  it("should show a help message for native models", () => {
    setup({
      cardType: "model",
    });

    expect(screen.getByText(/Models are data sources/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Learn more" }),
    ).toBeInTheDocument();
  });

  it.each([
    {
      parameter: createMockParameter({ type: "id" }),
      message: /variable/,
    },
    {
      parameter: createMockParameter({ type: "string/=" }),
      message: /text variable/,
    },
    {
      parameter: createMockParameter({ type: "number/!=" }),
      message: /number variable/,
    },
    {
      parameter: createMockParameter({ type: "date/all-options" }),
      message: /date variable/,
    },
  ])(
    "should show a help message for $parameter.type",
    ({ parameter, message }) => {
      setup({ parameter });
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Learn how" }),
      ).toBeInTheDocument();
    },
  );

  it.each([{ showMetabaseLinks: false }, { showMetabaseLinks: true }])(
    "should show a parameter help link and ignore the setting `show-metabase-links`: %s",
    ({ showMetabaseLinks }) => {
      setup({ showMetabaseLinks });
      expect(
        screen.getByRole("link", { name: "Learn how" }),
      ).toBeInTheDocument();
    },
  );

  it.each([{ showMetabaseLinks: false }, { showMetabaseLinks: true }])(
    "should show a model help link and ignore the setting `show-metabase-links`: %s",
    ({ showMetabaseLinks }) => {
      setup({ cardType: "model", showMetabaseLinks });
      expect(
        screen.getByRole("link", { name: "Learn more" }),
      ).toBeInTheDocument();
    },
  );
});
