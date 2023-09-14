import { render, screen } from "@testing-library/react";

import type { DataTypeInfoItem } from "metabase/containers/DataPicker";
import { getDataTypes } from "metabase/containers/DataPicker";

import DataSelectorDataBucketPicker from "./DataSelectorDataBucketPicker";

const setup = (dataTypes: DataTypeInfoItem[]) => {
  return render(
    <DataSelectorDataBucketPicker
      dataTypes={dataTypes}
      onChangeDataBucket={jest.fn()}
    />,
  );
};

describe("DataSelectorDataBucketPicker", () => {
  it("should display all buckets", () => {
    const dataTypes = getDataTypes({
      hasModels: true,
      hasSavedQuestions: true,
      hasNestedQueriesEnabled: true,
    });
    setup(dataTypes);

    expect(screen.getByText("Models")).toBeInTheDocument();
    expect(screen.getByText("Raw Data")).toBeInTheDocument();
    expect(screen.getByText("Saved Questions")).toBeInTheDocument();
    expect(screen.queryAllByTestId("data-bucket-list-item").length).toBe(
      dataTypes.length,
    );
  });

  it("should display no buckets", () => {
    const dataTypes: DataTypeInfoItem[] = [];
    setup(dataTypes);

    expect(screen.queryByText("Models")).not.toBeInTheDocument();
    expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved Questions")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("data-bucket-list-item").length).toBe(
      dataTypes.length,
    );
  });
});
