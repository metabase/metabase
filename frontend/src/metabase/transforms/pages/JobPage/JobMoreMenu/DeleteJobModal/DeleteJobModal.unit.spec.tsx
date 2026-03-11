import userEvent from "@testing-library/user-event";

import {
  setupDeleteTransformJobEndpoint,
  setupDeleteTransformJobEndpointWithError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { TransformJob } from "metabase-types/api";
import { createMockTransformJob } from "metabase-types/api/mocks";

import { DeleteJobModal } from "./DeleteJobModal";

type SetupOpts = {
  job?: TransformJob;
  isError?: boolean;
};

function setup({ job = createMockTransformJob(), isError }: SetupOpts = {}) {
  const onDelete = jest.fn();
  const onClose = jest.fn();

  if (isError) {
    setupDeleteTransformJobEndpointWithError(job.id);
  } else {
    setupDeleteTransformJobEndpoint(job.id);
  }

  renderWithProviders(
    <DeleteJobModal job={job} onDelete={onDelete} onClose={onClose} />,
  );

  return { onDelete, onClose };
}

describe("DeleteJobModal", () => {
  it("should be able to delete a job", async () => {
    const { onDelete, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete job" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("should be able to close the modal", async () => {
    const { onDelete, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("should handle API errors", async () => {
    const { onDelete, onClose } = setup({ isError: true });
    await userEvent.click(screen.getByRole("button", { name: "Delete job" }));
    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
