import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import {
  DeleteGroupMappingModal,
  type DeleteGroupMappingModalProps,
} from "./DeleteGroupMappingModal";

type SetupOpts = Partial<DeleteGroupMappingModalProps>;

const DEFAULT_PROPS = {
  name: "cn=People",
  groupIds: [1],
  onConfirm: jest.fn(),
  onHide: jest.fn(),
};

const setup = (props?: SetupOpts) => {
  renderWithProviders(
    <DeleteGroupMappingModal {...DEFAULT_PROPS} {...props} />,
  );
};

describe("DeleteGroupMappingModal", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows options for when mapping is linked to just one group", () => {
    setup();

    expect(
      screen.getByText(
        "Membership of this group will no longer be synced when users log in.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing, just remove the mapping"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Also remove all members from this group"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Members keep their Metabase accounts."),
    ).toBeInTheDocument();
    expect(screen.getByText("Also delete the group")).toBeInTheDocument();
    expect(screen.queryByText(/Administrators group/)).not.toBeInTheDocument();
  });

  it("shows options for when mapping is linked to more than one group", () => {
    setup({ groupIds: [1, 2] });

    expect(
      screen.getByText(
        "Membership of these groups will no longer be synced when users log in.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nothing, just remove the mapping"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Also remove all members from these groups"),
    ).toBeInTheDocument();
    expect(screen.getByText("Also delete the groups")).toBeInTheDocument();
  });

  it("notes that the Administrators group is left alone when it is mapped", () => {
    setup({ groupIds: [1, 2], hasAdminGroup: true });

    expect(
      screen.getAllByText(/The Administrators group is not affected/),
    ).toHaveLength(2);
  });

  it("offers no group options when only the Administrators group is mapped", () => {
    setup({ groupIds: [1], hasAdminGroup: true });

    expect(
      screen.getByText("The Administrators group is not affected."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove mapping" }),
    ).toBeInTheDocument();
  });

  it("offers no group options when no group is mapped", () => {
    setup({ groupIds: [] });

    expect(
      screen.getByText("This mapping isn't linked to any group."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove mapping" }),
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
      screen.getByLabelText("Also remove all members from this group"),
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
