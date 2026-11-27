import { renderWithProviders, screen } from "__support__/ui";
import { rem } from "metabase/ui";

import { ScalarLabel } from "./ScalarLabel";

interface SetupOpts {
  xPadding: number;
  description?: string | null;
}

const setup = ({ xPadding, description }: SetupOpts) => {
  renderWithProviders(
    <ScalarLabel xPadding={xPadding} description={description}>
      Title
    </ScalarLabel>,
  );

  return { label: screen.getByTestId("scalar-label") };
};

describe("ScalarLabel", () => {
  it.each([8, 24])(
    "should span the content width without a description at %ipx side padding",
    (xPadding) => {
      const { label } = setup({ xPadding });

      expect(label).toHaveStyle({ maxWidth: "100%" });
      expect(screen.queryByLabelText("info icon")).not.toBeInTheDocument();
    },
  );

  it.each([24, 32, 48])(
    "should span the content width when the %ipx side padding holds the description icon",
    (xPadding) => {
      const { label } = setup({ xPadding, description: "Description" });

      expect(label).toHaveStyle({ maxWidth: "100%" });
      expect(screen.getByLabelText("info icon")).toBeInTheDocument();
    },
  );

  it("should reserve only the icon space a narrow side padding cannot hold", () => {
    const { label } = setup({ xPadding: 8, description: "Description" });

    // the 16px icon and its 8px gap need 24px, 16px more than the padding
    expect(label).toHaveStyle({ maxWidth: `calc(100% - ${rem(32)})` });
    expect(screen.getByLabelText("info icon")).toBeInTheDocument();
  });
});
