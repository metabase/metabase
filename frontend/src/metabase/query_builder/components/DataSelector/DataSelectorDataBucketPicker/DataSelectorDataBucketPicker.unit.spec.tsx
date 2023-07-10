import { render, screen } from "@testing-library/react";

import { getDataTypes } from "metabase/containers/DataPicker";

import DataSelectorDataBucketPicker from "./DataSelectorDataBucketPicker";

describe("DataSelectorDataBucketPicker", () => {
  describe("when nested queries are enabled", () => {
    it("should display all non empty buckets - models & saved questions", () => {
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

    it("should display all non empty buckets - saved questions", () => {
      render(
        <DataSelectorDataBucketPicker
          dataTypes={getDataTypes({
            hasModels: false,
            hasSavedQuestions: true,
            hasNestedQueriesEnabled: true,
          })}
          onChangeDataBucket={jest.fn()}
        />,
      );

      expect(screen.queryByText("Models")).not.toBeInTheDocument();
      expect(screen.getByText("Raw Data")).toBeInTheDocument();
      expect(screen.getByText("Saved Questions")).toBeInTheDocument();
    });

    it("should display all non empty buckets - models", () => {
      render(
        <DataSelectorDataBucketPicker
          dataTypes={getDataTypes({
            hasModels: true,
            hasSavedQuestions: false,
            hasNestedQueriesEnabled: true,
          })}
          onChangeDataBucket={jest.fn()}
        />,
      );

      expect(screen.getByText("Models")).toBeInTheDocument();
      expect(screen.getByText("Raw Data")).toBeInTheDocument();
      expect(screen.queryByText("Saved Questions")).not.toBeInTheDocument();
    });
  });

  describe("when nested queries are disabled", () => {
    it("should not display models nor saved questions", () => {
      render(
        <DataSelectorDataBucketPicker
          dataTypes={getDataTypes({
            hasModels: true,
            hasSavedQuestions: true,
            hasNestedQueriesEnabled: false,
          })}
          onChangeDataBucket={jest.fn()}
        />,
      );

      expect(screen.queryByText("Models")).not.toBeInTheDocument();
      expect(screen.getByText("Raw Data")).toBeInTheDocument();
      expect(screen.queryByText("Saved Questions")).not.toBeInTheDocument();
    });
  });
});
