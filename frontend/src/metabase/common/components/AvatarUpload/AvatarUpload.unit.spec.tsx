import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AvatarUpload } from "./AvatarUpload";

const mockOnUpload = jest.fn();
const mockOnRemove = jest.fn();

const defaultProps = {
  currentAvatarUrl: null,
  onUpload: mockOnUpload,
  onRemove: mockOnRemove,
};

describe("AvatarUpload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render upload button when no avatar is present", () => {
    render(<AvatarUpload {...defaultProps} />);

    expect(screen.getByText("Upload Avatar")).toBeInTheDocument();
    expect(screen.queryByText("Change Avatar")).not.toBeInTheDocument();
  });

  it("should render change button when avatar is present", () => {
    render(
      <AvatarUpload
        {...defaultProps}
        currentAvatarUrl="data:image/jpeg;base64,test"
      />,
    );

    expect(screen.getByText("Change Avatar")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("should show avatar image when currentAvatarUrl is provided", () => {
    const avatarUrl = "data:image/jpeg;base64,test";
    render(<AvatarUpload {...defaultProps} currentAvatarUrl={avatarUrl} />);

    const avatarImage = screen.getByAltText("Profile avatar");
    expect(avatarImage).toBeInTheDocument();
    expect(avatarImage).toHaveAttribute("src", avatarUrl);
  });

  it("should show person icon when no avatar is present", () => {
    render(<AvatarUpload {...defaultProps} />);

    // The person icon should be present in the avatar preview area
    const avatarImage = screen.getByAltText("Profile avatar");
    expect(avatarImage).toBeInTheDocument();
  });

  it("should call onUpload when file is selected", async () => {
    const user = userEvent.setup();
    render(<AvatarUpload {...defaultProps} />);

    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const input = screen.getByRole("button", { name: "Upload Avatar" });

    await user.click(input);

    const fileInput = screen.getByTestId("avatar-file-input");
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(mockOnUpload).toHaveBeenCalled();
    });
  });

  it("should call onRemove when remove button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <AvatarUpload
        {...defaultProps}
        currentAvatarUrl="data:image/jpeg;base64,test"
      />,
    );

    const removeButton = screen.getByText("Remove");
    await user.click(removeButton);

    expect(mockOnRemove).toHaveBeenCalled();
  });

  it("should show error for invalid file type", async () => {
    const user = userEvent.setup();
    render(<AvatarUpload {...defaultProps} />);

    const file = new File(["test"], "test.txt", { type: "text/plain" });
    const input = screen.getByRole("button", { name: "Upload Avatar" });

    await user.click(input);

    const fileInput = screen.getByTestId("avatar-file-input");
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(
        screen.getByText("Please choose a JPG, PNG, or WebP image file."),
      ).toBeInTheDocument();
    });
  });

  it("should show error for file too large", async () => {
    const user = userEvent.setup();
    render(<AvatarUpload {...defaultProps} />);

    // Create a file larger than 2MB
    const largeFile = new File(["x".repeat(3 * 1024 * 1024)], "large.jpg", {
      type: "image/jpeg",
    });
    const input = screen.getByRole("button", { name: "Upload Avatar" });

    await user.click(input);

    const fileInput = screen.getByTestId("avatar-file-input");
    await user.upload(fileInput, largeFile);

    await waitFor(() => {
      expect(
        screen.getByText(
          "The image you chose is larger than 2MB. Please choose another one.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("should be disabled when disabled prop is true", () => {
    render(<AvatarUpload {...defaultProps} disabled={true} />);

    const uploadButton = screen.getByRole("button", { name: "Upload Avatar" });
    expect(uploadButton).toBeDisabled();
  });

  it("should show selected file name", async () => {
    const user = userEvent.setup();
    render(<AvatarUpload {...defaultProps} />);

    const file = new File(["test"], "my-avatar.jpg", { type: "image/jpeg" });
    const input = screen.getByRole("button", { name: "Upload Avatar" });

    await user.click(input);

    const fileInput = screen.getByTestId("avatar-file-input");
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText("Selected: my-avatar.jpg")).toBeInTheDocument();
    });
  });
});
