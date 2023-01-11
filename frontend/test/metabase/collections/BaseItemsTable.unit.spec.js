import React from "react";
import userEvent from "@testing-library/user-event";
import moment from "moment-timezone";
import { renderWithProviders, screen } from "__support__/ui";

import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
} from "metabase/lib/formatting/datetime-utils";

import BaseItemsTable from "metabase/collections/components/BaseItemsTable";

// eslint-disable-next-line react/display-name, react/prop-types
jest.mock("metabase/core/components/Link", () => ({ to, ...props }) => (
  <a {...props} href={to} />
));

const timestamp = "2021-06-03T19:46:52.128";

function getCollectionItem({
  id = 1,
  model = "dashboard",
  name = "My Item",
  icon = "dashboard",
  url = "/dashboard/1",
  ...rest
} = {}) {
  return {
    "last-edit-info": {
      id: 1,
      first_name: "John",
      last_name: "Doe",
      timestamp,
    },
    ...rest,
    id,
    model,
    name,
    getIcon: () => icon,
    getUrl: () => url,
  };
}

describe("Collections BaseItemsTable", () => {
  const ITEM = getCollectionItem();

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
    setup();
    const lastEditedAt = moment(timestamp).format("MMMM DD, YYYY");

    expect(screen.getByText(ITEM.name)).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText(lastEditedAt)).toBeInTheDocument();
  });

  it("displays last edit time on hover", () => {
    setup();
    const lastEditedAt = moment(timestamp).format("MMMM DD, YYYY");

    userEvent.hover(screen.getByText(lastEditedAt));

    expect(screen.getByRole("tooltip")).toHaveTextContent(
      moment(timestamp).format(`${DEFAULT_DATE_STYLE}, ${DEFAULT_TIME_STYLE}`),
    );
  });
});
