import { render, screen } from "__support__/ui";
import { Button, Modal } from "metabase/ui";

import { FormFooter } from "./FormFooter";

const Footer = () => (
  <FormFooter data-testid="footer" pageProps={{ className: "page-row" }}>
    <Button>Save</Button>
  </FormFooter>
);

describe("FormFooter", () => {
  it("applies its props and page props outside a modal", () => {
    render(<Footer />);

    const footer = screen.getByTestId("footer");
    expect(footer).toHaveClass("page-row");
    expect(footer).toContainElement(
      screen.getByRole("button", { name: "Save" }),
    );
  });

  it("applies its props but not its page props inside a modal", () => {
    render(
      <Modal opened title="Title" onClose={jest.fn()}>
        <Footer />
      </Modal>,
    );

    const footer = screen.getByTestId("footer");
    expect(footer).not.toHaveClass("page-row");
    expect(footer).toContainElement(
      screen.getByRole("button", { name: "Save" }),
    );
  });
});
