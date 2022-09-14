import React from "react";
import userEvent from "@testing-library/user-event";
import moment from "moment-timezone";
import { renderWithProviders } from "__support__/ui";

import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
} from "metabase/lib/formatting/datetime-utils";

import BaseItemsTable from "metabase/collections/components/BaseItemsTable";

describe("Collections BaseItemsTable", () => {
  const timestamp = "2021-06-03T19:46:52.128";

  const ITEM = {
    id: 1,
    model: "dashboard",
    name: "Test Dashboard",
    "last-edit-info": {
      id: 1,
      first_name: "John",
      last_name: "Doe",
      timestamp: timestamp,
    },
    getIcon: () => ({ name: "dashboard" }),
    getUrl: () => "/dashboard/1",
  };

  function setup({ items = [ITEM], ...props } = {}) {
    return renderWithProviders(
      <BaseItemsTable
        items={items}
        sortingOptions={{ sort_column: "name", sort_direction: "asc" }}
        onSortingOptionsChange={jest.fn()}
        {...props}
      />,
      { withDND: true },
    );
  }

  it("displays item data", () => {
    const { getByText } = setup();
    const lastEditedAt = moment(timestamp).format("MMMM DD, YYYY");

    expect(getByText(ITEM.name)).toBeInTheDocument();
    expect(getByText("John Doe")).toBeInTheDocument();
    expect(getByText(lastEditedAt)).toBeInTheDocument();
  });

  it("displays last edit time on hover", () => {
    const { getByText, getByRole } = setup();
    const lastEditedAt = moment(timestamp).format("MMMM DD, YYYY");

    userEvent.hover(getByText(lastEditedAt));

    expect(getByRole("tooltip")).toHaveTextContent(
      moment(timestamp).format(`${DEFAULT_DATE_STYLE}, ${DEFAULT_TIME_STYLE}`),
    );
  });
});
