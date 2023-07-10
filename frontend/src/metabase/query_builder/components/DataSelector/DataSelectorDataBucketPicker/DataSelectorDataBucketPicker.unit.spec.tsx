import { render, screen } from "@testing-library/react";

import { getDataTypes } from "metabase/containers/DataPicker";

import DataSelectorDataBucketPicker from "./DataSelectorDataBucketPicker";

describe("DataSelectorDataBucketPicker", () => {
  it("displays bucket names", () => {
    render(
      <DataSelectorDataBucketPicker
        dataTypes={getDataTypes({
          hasModels: true,
          hasSavedQuestions: true,
          hasNestedQueriesEnabled: true,
        })}
        onChangeDataBucket={jest.fn()}
      />,
    );

    expect(screen.getByText("Models")).toBeInTheDocument();
    expect(screen.getByText("Raw Data")).toBeInTheDocument();
    expect(screen.getByText("Saved Questions")).toBeInTheDocument();
  });
});
