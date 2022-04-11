import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import HistoryModal from "./HistoryModal";

function getRevision({
  isCreation = false,
  isReversion = false,
  userName = "John",
  timestamp = "2016-05-08T02:02:07.441Z",
  ...rest
} = {}) {
  return {
    id: Math.random(),
    is_reversion: isReversion,
    is_creation: isCreation,
    user: {
      common_name: userName,
    },
    timestamp,
    diff: null,
    ...rest,
  };
}

function getSimpleChangeRevision({ field, before, after, ...rest }) {
  return getRevision({
    ...rest,
    diff: {
      before: {
        [field]: before,
      },
      after: {
        [field]: after,
      },
    },
  });
}

const CHANGE_EVENT_REVISION = getSimpleChangeRevision({
  field: "archived",
  before: false,
  after: true,
  description: 'changed archived from "false" to "true"',
});

const REVISIONS = [
  getSimpleChangeRevision({ isReversion: true }),
  CHANGE_EVENT_REVISION,
  getSimpleChangeRevision({
    field: "description",
    before: null,
    after: "Very helpful dashboard",
    description: 'changed description from "null" to "Very helpful dashboard"',
  }),
  getRevision({ isCreation: true }),
];

function setup({ revisions = REVISIONS } = {}) {
  const onRevert = jest.fn().mockResolvedValue({});
  const onClose = jest.fn();
  render(
    <HistoryModal
      revisions={revisions}
      onRevert={onRevert}
      onClose={onClose}
    />,
  );
  return { onRevert, onClose };
}

describe("HistoryModal", () => {
  it("displays revisions", () => {
    setup();
    expect(screen.queryByText("created this")).toBeInTheDocument();
    expect(screen.queryByText("added a description")).toBeInTheDocument();
    expect(screen.queryByText("archived this")).toBeInTheDocument();
    expect(
      screen.queryByText("reverted to an earlier revision"),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("revision-history-row")).toHaveLength(4);
  });

  it("does not display invalid revisions", () => {
    setup({
      revisions: [getRevision({ diff: { before: null, after: null } })],
    });
    expect(screen.queryAllByTestId("revision-history-row")).toHaveLength(0);
  });

  it("calls onClose when close icon is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.queryByLabelText("close icon"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onRevert with a revision object when Revert button is clicked", () => {
    const { onRevert } = setup({
      revisions: [getRevision({ isCreation: true }), CHANGE_EVENT_REVISION],
    });

    fireEvent.click(screen.queryByRole("button", { name: "Revert" }));

    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(onRevert).toHaveBeenCalledWith(CHANGE_EVENT_REVISION);
  });
});
