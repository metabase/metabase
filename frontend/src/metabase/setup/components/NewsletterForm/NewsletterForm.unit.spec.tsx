import React, { FormHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewsletterForm from "./NewsletterForm";

const FormMock = (props: FormHTMLAttributes<HTMLFormElement>) => (
  <form {...props}>
    <button>Subscribe</button>
  </form>
);

jest.mock("metabase/containers/Form", () => FormMock);

jest.mock("metabase/entities/users", () => ({
  forms: { newsletter: jest.fn() },
}));

describe("NewsletterForm", () => {
  it("allows to submit the form with an email", async () => {
    const onSubscribe = jest.fn();

    render(<NewsletterForm onSubscribe={onSubscribe} />);
    userEvent.click(screen.getByText("Subscribe"));

    expect(await screen.findByText(/You're subscribed/)).toBeInTheDocument();
  });
});
