import { screen } from "__support__/ui";
import { setupForContentTranslationTest } from "metabase/i18n/test-utils";
import type { HoveredObject } from "metabase/visualizations/types";
import { createMockColumn, createMockSeries } from "metabase-types/api/mocks";

import {
  useTranslateFieldValuesInHoveredObject,
  useTranslateSeries,
} from "../utils";

describe("Content translation hooks (other than useTranslateContent)", () => {
  it("useTranslateSeries translates a series", async () => {
    const TestComponent = () => {
      const untranslatedSeries = createMockSeries();
      untranslatedSeries[0].data.cols = [
        createMockColumn({
          name: "col1",
          display_name: "Column 1",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "col2",
          display_name: "Column 2",
          semantic_type: "not translatable",
        }),
      ];
      untranslatedSeries[0].data.rows = [["a", "b"]];
      const series = useTranslateSeries(untranslatedSeries);

      // Display series as a simple table for testing purposes
      return (
        <table>
          <thead>
            <tr>
              {series[0].data.cols.map((col) => (
                <th key={col.name}>{col.display_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series[0].data.rows.map((row, index) => (
              <tr key={index}>
                {row.map((value, colIndex) => (
                  <td key={colIndex}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    };
    setupForContentTranslationTest({
      localeCode: "en",
      hasEnterprisePlugins: true,
      tokenFeatures: { content_translation: true },
      dictionary: [
        { locale: "en", msgid: "Column 1", msgstr: "translation of Column 1" },
        { locale: "en", msgid: "Column 2", msgstr: "translation of Column 2" },
        { locale: "en", msgid: "a", msgstr: "translation of a" },
      ],
      staticallyEmbedded: true,
      component: <TestComponent />,
    });
    await screen.findAllByText(/translation of/);
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent("translation of Column 1");
    expect(headers[1]).toHaveTextContent("translation of Column 2");

    const cells = screen.getAllByRole("cell");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveTextContent("translation of a");

    // This cell is not translated because the column does not have a categorical type
    expect(cells[1]).toHaveTextContent("b");
  });

  it("useTranslateSeries leaves field values in maps untranslated", async () => {
    const TestComponent = () => {
      const untranslatedSeries = createMockSeries();
      untranslatedSeries[0].card.display = "map";
      untranslatedSeries[0].data.cols = [
        createMockColumn({
          name: "col1",
          display_name: "Column 1",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "col2",
          display_name: "Column 2",
          semantic_type: "not translatable",
        }),
      ];
      untranslatedSeries[0].data.rows = [
        ["this should remain untranslated", "b"],
      ];
      const series = useTranslateSeries(untranslatedSeries);

      // Display series as a simple table for testing purposes
      return (
        <table>
          <thead>
            <tr>
              {series[0].data.cols.map((col) => (
                <th key={col.name}>{col.display_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series[0].data.rows.map((row, index) => (
              <tr key={index}>
                {row.map((value, colIndex) => (
                  <td key={colIndex}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    };
    setupForContentTranslationTest({
      localeCode: "en",
      hasEnterprisePlugins: true,
      tokenFeatures: { content_translation: true },
      dictionary: [
        { locale: "en", msgid: "Column 1", msgstr: "translation of Column 1" },
        { locale: "en", msgid: "Column 2", msgstr: "translation of Column 2" },
        {
          locale: "en",
          msgid: "this should remain untranslated",
          msgstr: "this translation should not appear",
        },
      ],
      staticallyEmbedded: true,
      component: <TestComponent />,
    });
    await screen.findAllByText(/translation of/);
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent("translation of Column 1");
    expect(headers[1]).toHaveTextContent("translation of Column 2");

    const cells = screen.getAllByRole("cell");
    expect(cells).toHaveLength(2);
    // This field value is not translated because the display is a map
    expect(cells[0]).toHaveTextContent("this should remain untranslated");

    // This field value is not translated because the column does not have a categorical type
    expect(cells[1]).toHaveTextContent("b");
  });

  it("translateFieldValuesInHoveredObject translates field values in a HoveredObject (which is used in visualization tooltips)", async () => {
    const TestComponent = () => {
      const untranslatedHoveredObject: HoveredObject = {
        data: [
          {
            key: "row1",
            col: createMockColumn({
              name: "col1",
              display_name: "Column 1",
              semantic_type: "type/Category", // Translated
            }),
            value: "a",
          },
          {
            key: "row2",
            col: createMockColumn({
              name: "col2",
              display_name: "Column 2",
              semantic_type: "type/Text", // Not translated
            }),
            value: "b",
          },
        ],
      };
      const hoveredObject = useTranslateFieldValuesInHoveredObject(
        untranslatedHoveredObject,
      );

      // Display hovered object as a simple table for testing purposes
      return (
        <table>
          <thead>
            <tr>
              {hoveredObject?.data?.map(({ col }) => (
                <th key={col?.name}>{col?.display_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {hoveredObject?.data?.map(({ value }, index) => (
                <td key={index}>{value}</td>
              ))}
            </tr>
          </tbody>
        </table>
      );
    };
    setupForContentTranslationTest({
      localeCode: "en",
      hasEnterprisePlugins: true,
      tokenFeatures: { content_translation: true },
      dictionary: [
        { locale: "en", msgid: "Column 1", msgstr: "translation of Column 1" },
        { locale: "en", msgid: "Column 2", msgstr: "translation of Column 2" },
        { locale: "en", msgid: "a", msgstr: "translation of a" },
      ],
      staticallyEmbedded: true,
      component: <TestComponent />,
    });
    await screen.findAllByText(/translation of/);
    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(2);
    // This hook does not translate field names
    expect(headers[0]).toHaveTextContent("Column 1");
    expect(headers[1]).toHaveTextContent("Column 2");

    const cells = screen.getAllByRole("cell");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveTextContent("translation of a");

    // This cell is not translated because the column does not have a categorical type
    expect(cells[1]).toHaveTextContent("b");
  });
});
