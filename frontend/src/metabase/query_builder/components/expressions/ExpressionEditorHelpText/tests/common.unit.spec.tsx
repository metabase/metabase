import { screen, within } from "@testing-library/react";

import { createMockMetadata } from "__support__/metadata";
import { getBrokenUpTextMatcher } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getHelpText } from "metabase-lib/v1/expressions/helper-text-strings";
import {
  createSampleDatabase,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

import { setup } from "./setup";

describe("ExpressionEditorHelpText (OSS)", () => {
  const metadata = createMockMetadata({ databases: [createSampleDatabase()] });
  const database = checkNotNull(metadata.database(SAMPLE_DB_ID));

  it("should render expression function info, example and documentation link", async () => {
    await setup({ helpText: getHelpText("datetime-diff", database, "UTC") });

    expect(
      screen.getByText('datetimeDiff([Created At], [Shipped At], "month")'),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        getBrokenUpTextMatcher("datetimeDiff(datetime1, datetime2, unit)"),
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Get the difference between two datetime values (datetime2 minus datetime1) using the specified unit of time.",
      ),
    ).toBeInTheDocument();

    const link = screen.getByRole("link");
    expect(link).toBeInTheDocument();
    expect(link).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/latest/questions/query-builder/expressions/datetimediff.html",
    );
  });

  it("should handle expression function without arguments", async () => {
    await setup({ helpText: getHelpText("cum-count", database, "UTC") });

    expect(screen.getAllByText("CumulativeCount")).toHaveLength(2);

    const exampleCodeEl = screen.getByTestId(
      "expression-helper-popover-structure",
    );
    expect(
      within(exampleCodeEl).getByText("CumulativeCount"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("The additive total of rows across a breakout."),
    ).toBeInTheDocument();
  });

  it("should render function arguments", async () => {
    const helpText = getHelpText("concat", database, "UTC");
    await setup({ helpText });

    const argumentsBlock = screen.getByTestId(
      "expression-helper-popover-arguments",
    );

    helpText?.args?.forEach(({ name, description }) => {
      expect(within(argumentsBlock).getByText(name)).toBeInTheDocument();
      expect(within(argumentsBlock).getByText(description)).toBeInTheDocument();
    });
  });

  describe("Metabase links", () => {
    const helpText = getHelpText("concat", database, "UTC");
    it("should show a help link when `show-metabase-links: true`", async () => {
      await setup({ helpText, showMetabaseLinks: true });

      expect(
        screen.getByRole("img", { name: "reference icon" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Learn more")).toBeInTheDocument();
    });

    it("should show a help link when `show-metabase-links: false`", async () => {
      await setup({ helpText, showMetabaseLinks: false });

      expect(
        screen.getByRole("img", { name: "reference icon" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Learn more")).toBeInTheDocument();
    });
  });
});
