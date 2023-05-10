import React from "react";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
  within,
} from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import DashboardPicker from "./DashboardPicker";

const setup = () => {

}

describe("DashboardPicker", () => {
    // just render colleciton with dashboard, show root

    // preselect some value, show this preselected value
})
