import { render, screen } from "__support__/ui";

import {
  EditableDescription,
  type EditableDescriptionProps,
} from "./EditableDescription";

const setup = (props?: Partial<EditableDescriptionProps>) => {
  render(
    <EditableDescription
      description={null}
      canWrite
      onChange={jest.fn()}
      {...props}
    />,
  );
};

describe("EditableDescription", () => {
  it("should render the description as markdown, not as raw text (metabase#34574)", () => {
    setup({
      description: "# Hello\n## World\nThis is an **important** description!",
    });

    expect(
      screen.getByRole("heading", { level: 1, name: "Hello" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "World" }),
    ).toBeInTheDocument();
    expect(screen.getByText("important").tagName).toBe("STRONG");

    // The raw markdown syntax must not leak through as plain text
    expect(screen.queryByText(/# Hello/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\*\*important\*\*/)).not.toBeInTheDocument();
  });
});
