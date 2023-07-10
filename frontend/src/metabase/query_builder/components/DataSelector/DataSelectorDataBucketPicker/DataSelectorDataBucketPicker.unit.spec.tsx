import { render, screen } from "@testing-library/react";

import { DataTypeInfoItem, getDataTypes } from "metabase/containers/DataPicker";

import DataSelectorDataBucketPicker from "./DataSelectorDataBucketPicker";

describe("DataSelectorDataBucketPicker", () => {
  it("should display all buckets", () => {
    const dataTypes = getDataTypes({
      hasModels: true,
      hasSavedQuestions: true,
      hasNestedQueriesEnabled: true,
    });

    const { container } = render(
      <DataSelectorDataBucketPicker
        dataTypes={dataTypes}
        onChangeDataBucket={jest.fn()}
      />,
    );

    expect(screen.getByText("Models")).toBeInTheDocument();
    expect(screen.getByText("Raw Data")).toBeInTheDocument();
    expect(screen.getByText("Saved Questions")).toBeInTheDocument();
    expect(container.childNodes[0].childNodes.length).toBe(dataTypes.length);
  });

  it("should display no buckets", () => {
    const dataTypes: DataTypeInfoItem[] = [];
    const { container } = render(
      <DataSelectorDataBucketPicker
        dataTypes={dataTypes}
        onChangeDataBucket={jest.fn()}
      />,
    );

    expect(screen.queryByText("Models")).not.toBeInTheDocument();
    expect(screen.queryByText("Raw Data")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved Questions")).not.toBeInTheDocument();
    expect(container.childNodes[0].childNodes.length).toBe(dataTypes.length);
  });
});
