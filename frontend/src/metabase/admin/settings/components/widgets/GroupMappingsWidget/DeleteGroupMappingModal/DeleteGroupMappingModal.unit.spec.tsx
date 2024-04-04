import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DeleteGroupMappingModalProps } from "./DeleteGroupMappingModal";
import DeleteGroupMappingModal from "./DeleteGroupMappingModal";

type SetupOpts = Partial<DeleteGroupMappingModalProps>;

const DEFAULT_PROPS = {
  name: "cn=People",
  groupIds: [1],
  onConfirm: jest.fn(),
  onHide: jest.fn(),
};

const setup = (props?: SetupOpts) => {
  render(<DeleteGroupMappingModal {...DEFAULT_PROPS} {...props} />);
};

describe("DeleteGroupMappingModal", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows options for when mapping is linked to just one group", () => {
    setup();

    expect(
      screen.getByText("Nothing, just remove the mapping"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Also remove all group members (except from Admin)"),
    ).toBeInTheDocument();

    expect(screen.getByText("Also delete the group")).toBeInTheDocument();
  });

  it("shows options for when mapping is linked to more than one group", () => {
    setup({ groupIds: [1, 2] });

    expect(
      screen.getByText("Nothing, just remove the mapping"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Also remove all group members (except from Admin)"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Also delete the groups (except Admin)"),
    ).toBeInTheDocument();
  });

  it("starts with 'Nothing' option checked", () => {
    setup();

    expect(
      screen.getByLabelText("Nothing, just remove the mapping"),
    ).toBeChecked();
  });

  it("confirms when clearing members", async () => {
    setup();

    await userEvent.click(
      screen.getByLabelText(
        "Also remove all group members (except from Admin)",
      ),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Remove mapping and members" }),
    );

    expect(DEFAULT_PROPS.onConfirm).toHaveBeenCalledWith(
      "clear",
      DEFAULT_PROPS.groupIds,
      DEFAULT_PROPS.name,
    );
  });

  it("confirms when deleting groups", async () => {
    setup();

    await userEvent.click(screen.getByLabelText("Also delete the group"));

    await userEvent.click(
      screen.getByRole("button", { name: "Remove mapping and delete group" }),
    );

    expect(DEFAULT_PROPS.onConfirm).toHaveBeenCalledWith(
      "delete",
      DEFAULT_PROPS.groupIds,
      DEFAULT_PROPS.name,
    );
  });
});
