import React from "react";
import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen } from "__support__/ui";
import {
  PEOPLE,
  PRODUCTS,
  metadata,
} from "__support__/sample_database_fixture";

import { TagEditorParam } from "./TagEditorParam";

const mockFieldId = PRODUCTS.RATING.id;
jest.mock("metabase/query_builder/components/DataSelector", () => ({
  // eslint-disable-next-line react/prop-types
  SchemaTableAndFieldDataSelector: function FakeSelector({ setFieldFn }) {
    return (
      <button
        data-testid="fake-selector"
        onClick={() => setFieldFn(mockFieldId)}
      />
    );
  },
}));

jest.mock("metabase/entities/schemas", () => ({
  Loader: ({ children }) => children(),
}));

const mockFetchField = jest.fn();
const mockSetTemplateTag = jest.fn();
const mockSetParameterValue = jest.fn();

const mappedDimensionTag = {
  type: "dimension",
  dimension: ["field", PEOPLE.NAME.id, null],
  "widget-type": "string/starts-with",
};

const unmappedDimensionTag = {
  type: "dimension",
  dimension: undefined,
};

const textTag = {
  type: "text",
};

function setup(props = {}) {
  return render(
    <TagEditorParam
      fetchField={mockFetchField}
      setTemplateTag={mockSetTemplateTag}
      setParameterValue={mockSetParameterValue}
      metadata={metadata}
      {...props}
    />,
  );
}

describe("TagEditorParam", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("dimension template tag", () => {
    it("should forcefully fetch the field associated with the template tag", () => {
      setup({
        tag: mappedDimensionTag,
      });

      expect(mockFetchField).toHaveBeenCalledWith(
        mappedDimensionTag.dimension[1],
        true,
      );
    });

    it("should do nothing when there is no field associated with the template tag", () => {
      setup({
        tag: unmappedDimensionTag,
      });

      expect(mockFetchField).not.toHaveBeenCalled();
    });
  });

  describe("when changing the template tag type", () => {
    it("should update the type property of the tag object", () => {
      setup({
        tag: textTag,
      });

      screen.getByText("Text").click();
      screen.getByText("Number").click();

      expect(mockSetTemplateTag).toHaveBeenCalledWith({
        ...textTag,
        type: "number",
        default: undefined,
        dimension: undefined,
        "widget-type": undefined,
      });
    });

    it("should clear dimension and widget-type properties on the tag", () => {
      setup({
        tag: {
          ...mappedDimensionTag,
          "widget-type": "bar",
        },
      });

      screen.getByText("Field Filter").click();
      screen.getByText("Text").click();

      expect(mockSetTemplateTag).toHaveBeenCalledWith({
        ...mappedDimensionTag,
        type: "text",
        default: undefined,
        dimension: undefined,
        "widget-type": undefined,
      });
    });
  });

  describe("when changing the filter widget type", () => {
    it("should update the widget-type property of the tag", () => {
      setup({
        tag: mappedDimensionTag,
      });

      screen.getByText("String starts with").click();
      screen.getByText("String contains").click();

      expect(mockSetTemplateTag).toHaveBeenCalledWith({
        ...mappedDimensionTag,
        "widget-type": "string/contains",
      });
    });

    it("should replace old location widget-type values with string/=", () => {
      setup({
        tag: {
          ...mappedDimensionTag,
          "widget-type": "location/country",
        },
      });

      expect(screen.getByText("String")).toBeInTheDocument();
    });
  });

  describe("when clicking the required toggle", () => {
    it("should update the required property on the tag object", () => {
      setup({
        tag: mappedDimensionTag,
      });

      userEvent.click(screen.getByRole("switch"));

      expect(mockSetTemplateTag).toHaveBeenCalledWith({
        ...mappedDimensionTag,
        required: true,
        default: undefined,
      });
    });

    it("should clear the default when making the tag not required", () => {
      setup({
        tag: {
          ...mappedDimensionTag,
          required: true,
          default: "foo",
        },
      });

      userEvent.click(screen.getByRole("switch"));

      expect(mockSetTemplateTag).toHaveBeenCalledWith({
        ...mappedDimensionTag,
        required: false,
        default: undefined,
      });
    });
  });

  describe("when changing the display name of the tag", () => {
    it("should update the display-name property", () => {
      setup({
        tag: mappedDimensionTag,
      });

      const input = screen.getByTestId("tag-display-name-input");
      userEvent.type(input, "Foo");
      fireEvent.blur(input);

      expect(mockSetTemplateTag).toHaveBeenCalledWith({
        ...mappedDimensionTag,
        "display-name": "Foo",
      });
    });
  });

  describe("when the dimension associated with the tag is updated", () => {
    it("should update the dimension property", () => {
      setup({
        tag: mappedDimensionTag,
      });

      userEvent.click(screen.getByTestId("fake-selector"));

      expect(mockSetTemplateTag).toHaveBeenCalledWith({
        ...mappedDimensionTag,
        dimension: ["field", PRODUCTS.RATING.id, null],
      });
    });
  });
});
