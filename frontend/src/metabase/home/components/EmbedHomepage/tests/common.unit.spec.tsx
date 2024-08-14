import userEvent from "@testing-library/user-event";

import { screen, waitForElementToBeRemoved } from "__support__/ui";

import {
  queryFeedbackModal,
  getLastHomepageSettingSettingCall,
  setup,
  getLastFeedbackCall,
} from "./setup";

describe("EmbedHomepage (OSS)", () => {
  it("should default to the static tab for OSS builds", () => {
    setup();
    expect(
      screen.getByText("Use static embedding", { exact: false }),
    ).toBeInTheDocument();

    // making sure Tabs isn't just rendering both tabs, making the test always pass

    expect(
      screen.queryByText("Use interactive embedding", { exact: false }),
    ).not.toBeInTheDocument();
  });

  it("should link to the docs", () => {
    setup();
    expect(screen.getByText("Learn more")).toHaveAttribute(
      "href",
      "https://www.metabase.com/docs/latest/embedding/static-embedding.html?utm_source=product&source_plan=oss&utm_content=embedding-homepage",
    );
  });

  it("should link to the example dashboard if `example-dashboard-id` is set", () => {
    setup({ settings: { "example-dashboard-id": 1 } });

    expect(
      screen.getByText("Select a question", { exact: false }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: /Embed this example dashboard/i,
      }),
    ).toHaveAttribute("href", "/dashboard/1");
  });

  it("should prompt to create a question if `example-dashboard-id` is not set", () => {
    setup({ settings: { "example-dashboard-id": null } });

    expect(
      screen.getByText("Create a question", { exact: false }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("link", {
        name: "Embed this example dashboard",
      }),
    ).not.toBeInTheDocument();
  });

  it("should prompt to enable embedding if it wasn't auto enabled", () => {
    setup({ settings: { "setup-embedding-autoenabled": false } });

    expect(
      screen.getByText("Enable embedding in the settings"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Embedding has been automatically enabled for you"),
    ).not.toBeInTheDocument();
  });

  it("should not prompt to enable embedding if it was auto enabled", () => {
    setup({ settings: { "setup-embedding-autoenabled": true } });

    expect(
      screen.queryByText("Enable embedding in the settings"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Embedding has been automatically enabled for you"),
    ).toBeInTheDocument();
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

      await waitForElementToBeRemoved(() => queryFeedbackModal());
    });

    it("should dismiss when submitting feedback - even if empty, should not actually send the feedback", async () => {
      await setupForFeedbackModal();

      await userEvent.click(screen.getByText("Skip"));

      const lastCall = getLastHomepageSettingSettingCall();

      const body = await lastCall?.request?.json();
      expect(body).toEqual({ value: "dismissed-run-into-issues" });

      await waitForElementToBeRemoved(() => queryFeedbackModal());

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
        screen.getByText("Your feedback was submitted, thank you."),
      ).toBeInTheDocument();
    });
  });
});
