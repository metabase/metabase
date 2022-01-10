import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewsletterForm from "./NewsletterForm";

describe("NewsletterForm", () => {
  it("allows to submit the form with an email", () => {
    const onSubscribe = jest.fn();

    render(<NewsletterForm onSubscribe={onSubscribe} />);

    userEvent.type(screen.getByPlaceholderText("Email address"), "a@b.com");
    userEvent.click(screen.getByText("Subscribe"));

    expect(screen.getByText(/You're subscribed/)).toBeInTheDocument();
    expect(onSubscribe).toHaveBeenCalledWith("a@b.com");
  });
});
