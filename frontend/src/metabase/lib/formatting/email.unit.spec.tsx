import { render, screen } from "__support__/ui";

import { formatEmail } from "./email";

function setup({ email }: { email: string }) {
  render(<>{formatEmail(email, { jsx: true, rich: true })}</>);
}

describe("formatEmail", () => {
  it("should format emails without unicode characters as links", () => {
    const email = "foo@example.com";
    setup({ email });
    expect(screen.getByText(email)).toHaveAttribute("href", `mailto:${email}`);
  });

  it("should format emails with unicode characters as links", () => {
    const email = "hafthór_júlíus_björnsson@gameofthron.es";
    setup({ email });
    expect(screen.getByText(email)).toHaveAttribute("href", `mailto:${email}`);
  });
});
