import { render, screen } from "@testing-library/react";

import DataSelectorDataBucketPicker from "./DataSelectorDataBucketPicker";

describe("DataSelectorDataBucketPicker", () => {
  it("displays bucket names", () => {
    render(<DataSelectorDataBucketPicker onChangeDataBucket={jest.fn()} />);

    expect(screen.getByText("Models")).toBeInTheDocument();
    expect(screen.getByText("Raw Data")).toBeInTheDocument();
    expect(screen.getByText("Saved Questions")).toBeInTheDocument();
  });
});
