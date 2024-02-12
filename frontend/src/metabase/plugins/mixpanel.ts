import mixpanelBrowser from "mixpanel-browser";
mixpanelBrowser.init("af36711c4e68579fe13f8e2c0570edda");

export const mixpanel = {
  trackEvent(eventName: string, userEmail?: string) {
    let email = "";
    if (userEmail) {
      email = userEmail;
    } else {
      email = localStorage.getItem(this.localStorageKey) || "";
    }

    this.identify(email);
    mixpanelBrowser.track(eventName);
  },
  identify(email: string) {
    if (window) {
      const customerName = window.location.host
        .replace("metabase-", "")
        .replace(".dadosfera.ai", "");

      mixpanelBrowser.identify(email);
      mixpanelBrowser.people.set({
        $name: email,
        $email: email,
        customer_name: customerName,
      });
    }
  },
  reset() {
    mixpanelBrowser.reset();
  },
  events: {
    login: "metabase_login",
    summarize: {
      open: "metabase_summarize_open",
      close: "metabase_summarize_close",
      done: "metabase_summarize_done",
      run_query: "metabase_summarize_run_query",
    },
    question: {
      native_open: "metabase_question_native_open",
    },
    model_open: "metabase_model_open",
    create_dashboard: "metabase_create_dashboard",
    create_collection: "metabase_create_collection",
    access_people: "metabase_access_people",
    xray: "metabase_xray",
    card_save: "metabase_card_save",
    dashboard_save: "metabase_dashboard_save",
  },
  localStorageKey: "metabase-user",
};
