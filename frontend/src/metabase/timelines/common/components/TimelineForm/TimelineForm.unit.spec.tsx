import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";
import { createMockTimelineData } from "metabase-types/api/mocks";

import type { TimelineFormProps } from "./TimelineForm";
import TimelineForm from "./TimelineForm";

describe("TimelineForm", () => {
  it("should render icons and text", async () => {
    const props = getProps();

    render(<TimelineForm {...props} />);

    expect(
      screen.getByTitle<HTMLInputElement>("Default icon").value.length,
    ).toBeGreaterThan(0);

    await userEvent.click(screen.getByTitle("Default icon"));

    const options = await screen.findAllByRole("option");

    expect(options.length).toBeGreaterThan(0);

    options.forEach((el) => {
      expect(within(el).getByRole("img")).toBeInTheDocument();

      expect(el.textContent.length).toBeGreaterThan(0);
    });
  });
});

const getProps = (opts?: Partial<TimelineFormProps>): TimelineFormProps => ({
  onSubmit: jest.fn(),
  initialValues: createMockTimelineData(),
  ...opts,
});
