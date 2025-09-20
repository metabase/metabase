import { renderWithProviders, screen } from "__support__/ui";
import { createMockTransformJob } from "metabase-types/api/mocks";

import { JobView } from "./JobView";
import type { TransformJobInfo } from "./types";

type SetupOpts = {
  job?: TransformJobInfo;
};

function setup({ job = createMockTransformJob() }: SetupOpts) {
  const onNameChange = jest.fn();
  const onDescriptionChange = jest.fn();
  const onScheduleChange = jest.fn();
  const onTagListChange = jest.fn();

  renderWithProviders(
    <JobView
      job={job}
      onNameChange={onNameChange}
      onDescriptionChange={onDescriptionChange}
      onScheduleChange={onScheduleChange}
      onTagListChange={onTagListChange}
    />,
  );

  return {
    onNameChange,
    onDescriptionChange,
    onScheduleChange,
    onTagListChange,
  };
}

describe("JobView", () => {
  it("should render the manage section for a saved job", () => {
    setup({ job: createMockTransformJob() });
    expect(
      screen.getByRole("button", { name: "Delete this job" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("should render the save section for a unsaved job", () => {
    const { id, ...unsavedJob } = createMockTransformJob();
    setup({ job: unsavedJob });
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete this job" }),
    ).not.toBeInTheDocument();
  });
});
