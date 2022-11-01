import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewsletterForm, { NewsletterFormProps } from "./NewsletterForm";

describe("NewsletterForm", () => {
  it("should allow to submit the form with the provided email", async () => {
    const props = getProps({
      onSubscribe: jest.fn().mockResolvedValue({}),
    });

    render(<NewsletterForm {...props} />);
    userEvent.click(screen.getByText("Subscribe"));

    expect(await screen.findByText(/You're subscribed/)).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<NewsletterFormProps>,
): NewsletterFormProps => ({
  initialEmail: "user@metabase.test",
  onSubscribe: jest.fn(),
  ...opts,
});
