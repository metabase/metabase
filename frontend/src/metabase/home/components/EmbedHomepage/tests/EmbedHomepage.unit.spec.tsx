import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { fireEvent, screen, within } from "__support__/ui";

import {
  getLastFeedbackCall,
  getLastHomepageSettingSettingCall,
  queryFeedbackModal,
  setup,
} from "./setup";

describe("EmbedHomepage (OSS)", () => {
  it("should link to the docs for static embedding", () => {
    setup();

    expect(
      screen.getAllByRole("link", { name: "Read the docs" })[0],
    ).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/static-embedding.html?utm_source=product&source_plan=oss&utm_content=embedding-homepage",
    );
  });

  it("should link to the docs for embed js embedding", () => {
    setup();

    const embedJsSection = screen.getByRole("region", {
      name: "Modular embedding",
    });

    // Then find the "Read the docs" button within that section
    const readEmbedJsDocsLink = within(embedJsSection).getByRole("link", {
      name: "Read the docs",
    });

    expect(readEmbedJsDocsLink).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/embedded-analytics-js.html?utm_source=product&source_plan=oss&utm_content=embedding-homepage",
    );
  });

  it("should link to the SDK quickstart", () => {
    setup();

    expect(
      screen.getAllByRole("link", { name: "Check out the Quickstart" })[0],
    ).toHaveAttribute(
      "href",
      "https://metaba.se/sdk-quick-start?utm_source=product&source_plan=oss&utm_content=embedding-homepage",
    );
  });

  it("should link to the SDK docs", () => {
    setup();

    const sdkSection = screen.getByRole("region", {
      name: "Embedded analytics SDK for React",
    });

    const readSdkDocsLink = within(sdkSection).getByRole("link", {
      name: "Read the docs",
    });

    expect(readSdkDocsLink).toHaveAttribute(
      "href",
      "https://metaba.se/sdk-docs?utm_source=product&source_plan=oss&utm_content=embedding-homepage",
    );
  });

  it("should link to the example dashboard if `example-dashboard-id` is set", () => {
    setup({ settings: { "example-dashboard-id": 1 } });

    expect(
      screen.getByRole("link", {
        name: /Embed an example dashboard/i,
      }),
    ).toHaveAttribute("href", "/dashboard/1");
  });

  it("should set 'embedding-homepage' to 'dismissed-done' when dismissing as done", async () => {
    setup();
    await userEvent.hover(screen.getByText("Hide these"));

    await userEvent.click(screen.getByText("Embedding done, all good"));

    const lastCall = getLastHomepageSettingSettingCall();

    const body = await lastCall?.request?.json();
    expect(body).toEqual({ value: "dismissed-done" });
  });

  it("should set 'embedding-homepage' to 'dismissed-not-interested-now' when dismissing because not interested", async () => {
    setup();
    await userEvent.hover(screen.getByText("Hide these"));

    await userEvent.click(screen.getByText("I'm not interested right now"));

    const lastCall = getLastHomepageSettingSettingCall();

    const body = await lastCall?.request?.json();
    expect(body).toEqual({ value: "dismissed-not-interested-now" });
  });

  describe("Feedback modal", () => {
    const setupForFeedbackModal = async () => {
      setup();
      await userEvent.hover(screen.getByText("Hide these"));

      await userEvent.click(screen.getByText("I ran into issues"));
    };

    it("should ask for feedback when dismissing because of issues", async () => {
      await setupForFeedbackModal();

      expect(
        screen.getByText("How can we improve embedding?"),
      ).toBeInTheDocument();
    });

    it("should display 'Skip' in the button when inputs are empty, 'Send' if any input has content", async () => {
      await setupForFeedbackModal();

      expect(screen.getByText("Skip")).toBeInTheDocument();

      await userEvent.type(
        screen.getByLabelText("Feedback"),
        "I had an issue with X",
      );

      expect(screen.queryByText("Skip")).not.toBeInTheDocument();
      expect(screen.getByText("Send")).toBeInTheDocument();

      await userEvent.clear(screen.getByLabelText("Feedback"));
      await userEvent.type(screen.getByLabelText("Feedback"), "   ");
      expect(screen.getByText("Skip")).toBeInTheDocument();

      await userEvent.type(
        screen.getByLabelText("Email"),
        "example@example.org",
      );

      expect(screen.queryByText("Skip")).not.toBeInTheDocument();
      expect(screen.getByText("Send")).toBeInTheDocument();
    });

    it("should not dismiss the homepage when the user cancels the feedback modal", async () => {
      await setupForFeedbackModal();

      await userEvent.click(screen.getByText("Cancel"));

      expect(getLastHomepageSettingSettingCall()).toBeUndefined();
    });

    it("should dismiss when submitting feedback - even if empty, should not actually send the feedback", async () => {
      await setupForFeedbackModal();

      await userEvent.click(screen.getByText("Skip"));

      const lastCall = getLastHomepageSettingSettingCall();

      const body = await lastCall?.request?.json();
      expect(body).toEqual({ value: "dismissed-run-into-issues" });

      expect(queryFeedbackModal()).not.toBeInTheDocument();

      // when both fields are empty, the button says "Skip" and
      // we should not make the http call
      expect(getLastFeedbackCall()).toBeUndefined();

      expect(
        screen.queryByText("Your feedback was submitted, thank you."),
      ).not.toBeInTheDocument();
    });

    it("should send feedback when submitting the modal", async () => {
      await setupForFeedbackModal();

      await userEvent.type(
        screen.getByLabelText("Feedback"),
        "I had an issue with X",
      );

      await userEvent.type(screen.getByLabelText("Email"), "user@example.org");

      await userEvent.click(screen.getByText("Send"));

      const lastCall = getLastHomepageSettingSettingCall();
      const body = await lastCall?.request?.json();
      expect(body).toEqual({ value: "dismissed-run-into-issues" });

      const feedbackBody = await getLastFeedbackCall()?.request?.json();

      expect(feedbackBody).toEqual({
        comments: "I had an issue with X",
        email: "user@example.org",
        source: "embedding-homepage-dismiss",
      });

      expect(
        await screen.findByText("Your feedback was submitted, thank you."),
      ).toBeInTheDocument();
    });

    it("should keep the feedback modal open and show an error when feedback submission fails", async () => {
      fetchMock.post("path:/api/product-feedback", { status: 400, body: {} });
      await setupForFeedbackModal();

      await userEvent.type(
        screen.getByLabelText("Feedback"),
        "I had an issue with X",
      );

      await userEvent.click(screen.getByText("Send"));

      expect(await screen.findByText("An error occurred")).toBeInTheDocument();

      // the homepage is not dismissed while the feedback failed to submit
      expect(queryFeedbackModal()).toBeInTheDocument();
      expect(getLastHomepageSettingSettingCall()).toBeUndefined();
      expect(
        screen.queryByText("Your feedback was submitted, thank you."),
      ).not.toBeInTheDocument();

      fetchMock.post("path:/api/product-feedback", 200);
    });

    it("should show per-field validation errors under the corresponding inputs", async () => {
      fetchMock.post("path:/api/product-feedback", {
        status: 400,
        body: {
          errors: {
            comments:
              "nullable value must be a non-blank string with at most 300000 characters.",
            email:
              "nullable value must be a non-blank string with at most 320 characters.",
          },
        },
      });
      await setupForFeedbackModal();

      await userEvent.type(
        screen.getByLabelText("Feedback"),
        "I had an issue with X",
      );

      await userEvent.click(screen.getByText("Send"));

      expect(
        await screen.findByText(
          "nullable value must be a non-blank string with at most 300000 characters.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "nullable value must be a non-blank string with at most 320 characters.",
        ),
      ).toBeInTheDocument();

      // the homepage is not dismissed while the feedback failed to submit
      expect(queryFeedbackModal()).toBeInTheDocument();
      expect(getLastHomepageSettingSettingCall()).toBeUndefined();
      expect(
        screen.queryByText("Your feedback was submitted, thank you."),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("An error occurred")).not.toBeInTheDocument();

      fetchMock.post("path:/api/product-feedback", 200);
    });

    it("should validate the maximum input lengths client-side", async () => {
      await setupForFeedbackModal();

      // `fireEvent` sets the value in a single event; `userEvent.type` would
      // simulate 100,001 keystrokes, causing the test to time out.
      const feedback = screen.getByLabelText("Feedback");
      fireEvent.change(feedback, { target: { value: "x".repeat(100_001) } });
      fireEvent.blur(feedback);

      expect(
        await screen.findByText("must be 100000 characters or less"),
      ).toBeInTheDocument();

      const email = screen.getByLabelText("Email");
      fireEvent.change(email, { target: { value: "x".repeat(321) } });
      fireEvent.blur(email);

      expect(
        await screen.findByText("must be 320 characters or less"),
      ).toBeInTheDocument();

      // an invalid form is not submitted
      await userEvent.click(screen.getByText("Send"));

      expect(getLastFeedbackCall()).toBeUndefined();
      expect(getLastHomepageSettingSettingCall()).toBeUndefined();
      expect(queryFeedbackModal()).toBeInTheDocument();
    });
  });

  it("should show the advanced embeds upsell for OSS users", () => {
    setup({ isAdmin: true });

    expect(screen.getByText("More advanced embeds")).toBeInTheDocument();

    expect(
      screen.getByText(
        "Give your customers the full power of Metabase in your own app, with SSO, advanced permissions, customization, and more.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "Try Metabase Pro" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "Try Metabase Pro" }),
    ).toHaveAttribute(
      "href",
      "https://www.metabase.com/upgrade?utm_source=product&utm_medium=upsell&utm_campaign=advanced-embeds&utm_content=embedding-homepage&source_plan=oss",
    );
  });
});
