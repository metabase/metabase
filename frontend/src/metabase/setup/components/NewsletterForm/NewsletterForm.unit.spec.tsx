import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewsletterForm from "./NewsletterForm";

describe("NewsletterForm", () => {
  it("should allow to submit the form with the provided email", async () => {
    const email = "user@metabase.test";
    const onSubscribe = jest.fn().mockResolvedValue({});

    render(<NewsletterForm initialEmail={email} onSubscribe={onSubscribe} />);
    userEvent.click(screen.getByText("Subscribe"));

    await waitFor(() => {
      expect(onSubscribe).toHaveBeenCalledWith(email);
    });
    expect(screen.getByText(/You're subscribed/)).toBeInTheDocument();
  });
});
