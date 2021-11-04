import React from "react";
import { render } from "@testing-library/react";
import { SyncModal } from "./SyncModal";

describe("SyncModal", () => {
  const database = { id: 1, name: "Sample Dataset" };

  it("should render with sample dataset and xrays enabled", () => {
    render(<SyncModal sampleDatabase={database}  />)
  })
});
