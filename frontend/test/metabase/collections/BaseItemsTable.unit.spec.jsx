import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import moment from "moment";

import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
} from "metabase/lib/formatting/date";

import BaseItemsTable from "metabase/collections/components/BaseItemsTable";

describe("Collections BaseItemsTable", () => {
  const now = moment()
    .utc()
    .valueOf();

  const ITEM = {
    id: 1,
    model: "dashboard",
    name: "Test Dashboard",
    "last-edit-info": {
      id: 1,
      first_name: "John",
      last_name: "Doe",
      timestamp: now,
    },
    getIcon: () => "dashboard",
    getUrl: () => "/dashboard/1",
  };

  it("displays item data", () => {
    const { getByText } = render(<BaseItemsTable items={[ITEM]} />);
    const lastEditedAt = moment(now).format("MMMM DD, YYYY");

    expect(getByText(ITEM.name)).toBeInTheDocument();
    expect(getByText("John Doe")).toBeInTheDocument();
    expect(getByText(lastEditedAt)).toBeInTheDocument();
  });
});
