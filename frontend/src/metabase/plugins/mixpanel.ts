import mixpanelBrowser from "mixpanel-browser";
mixpanelBrowser.init("af36711c4e68579fe13f8e2c0570edda");

export const mixpanel = {
  trackEvent(eventName: string, userEmail: string) {
    console.log("Track:", eventName, userEmail);
    if (userEmail) {
      this.identify(userEmail);
    }
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
  },
};
