export const showAnonymousTrackingInfo = () => {
  return `
By default, Metabase will phone home some data collected via Google Analytics and Snowplow.

We only collect anonymous Metabase data; we don’t collect any of your data. We don’t collect any usernames, emails, server IPs, database details of any kind, or any personally identifiable information (PII).

This anonymous data helps us understand how people are actually using Metabase, which in turn helps us prioritize what to work on next.

You can opt out of providing us with your anonymous usage data:

1. Click on the gear icon.
2. Select Admin settings.
3. Go to the Settings tab.
4. Click General
5. Toggle the Anonymous tracking option.
`;
};
