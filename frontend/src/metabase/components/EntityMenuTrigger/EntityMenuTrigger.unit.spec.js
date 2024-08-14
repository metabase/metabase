import { render, screen, fireEvent } from "@testing-library/react";

import EntityMenuTrigger from "metabase/components/EntityMenuTrigger";

describe("EntityMenuTrigger", () => {
  it("should render the desired icon and call its onClick fn", () => {
    const spy = jest.fn();
    render(<EntityMenuTrigger icon="pencil" onClick={spy} />);

    fireEvent.click(screen.getByRole("img", { name: /pencil icon/i }));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
