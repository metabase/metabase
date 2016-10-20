// TEMPORARY UNTIL WE INTEGRATE THIS STUFF IN THE BACKEND

export const segments = [
    { id: "gaid::-1",    name: "All Users", is_active: true },
    { id: "gaid::-2",    name: "New Users", is_active: true },
    { id: "gaid::-3",    name: "Returning Users", is_active: true },
    { id: "gaid::-4",    name: "Paid Traffic", is_active: true },
    { id: "gaid::-5",    name: "Organic Traffic", is_active: true },
    { id: "gaid::-6",    name: "Search Traffic", is_active: true },
    { id: "gaid::-7",    name: "Direct Traffic", is_active: true },
    { id: "gaid::-8",    name: "Referral Traffic", is_active: true },
    { id: "gaid::-9",    name: "Sessions with Conversions", is_active: true },
    { id: "gaid::-10",   name: "Sessions with Transactions", is_active: true },
    { id: "gaid::-11",   name: "Mobile and Tablet Traffic", is_active: true },
    { id: "gaid::-12",   name: "Non-bounce Sessions", is_active: true },
    { id: "gaid::-13",   name: "Tablet Traffic", is_active: true },
    { id: "gaid::-14",   name: "Mobile Traffic", is_active: true },
    { id: "gaid::-15",   name: "Tablet and Desktop Traffic", is_active: true },
    { id: "gaid::-16",   name: "Android Traffic", is_active: true },
    { id: "gaid::-17",   name: "iOS Traffic", is_active: true },
    { id: "gaid::-18",   name: "Other Traffic (Neither iOS nor Android)", is_active: true },
    { id: "gaid::-19",   name: "Bounced Sessions", is_active: true },
    { id: "gaid::-100",  name: "Single Session Users", is_active: true },
    { id: "gaid::-101",  name: "Multi-session Users", is_active: true },
    { id: "gaid::-102",  name: "Converters", is_active: true },
    { id: "gaid::-103",  name: "Non-Converters", is_active: true },
    { id: "gaid::-104",  name: "Made a Purchase", is_active: true },
    { id: "gaid::-105",  name: "Performed Site Search", is_active: true },
];

export const metrics =
[ { id: 'ga:users',
    name: 'Users',
    description: 'The total number of users for the requested time period.',
    is_active: true },
  { id: 'ga:visitors',
    name: 'Users',
    description: 'The total number of users for the requested time period.',
    is_active: false },
  { id: 'ga:newUsers',
    name: 'New Users',
    description: 'The number of users whose session was marked as a first-time session.',
    is_active: true },
  { id: 'ga:newVisits',
    name: 'New Users',
    description: 'The number of users whose session was marked as a first-time session.',
    is_active: false },
  { id: 'ga:percentNewSessions',
    name: '% New Sessions',
    description: 'The percentage of sessions by users who had never visited the property before.',
    is_active: true },
  { id: 'ga:percentNewVisits',
    name: '% New Sessions',
    description: 'The percentage of sessions by users who had never visited the property before.',
    is_active: false },
  { id: 'ga:1dayUsers',
    name: '1 Day Active Users',
    description: 'Total number of 1-day active users for each day in the requested time period. At least one of ga:nthDay, ga:date, or ga:day must be specified as a dimension to query this metric. For a given date, the returned value will be the total number of unique users for the 1-day period ending on the given date.',
    is_active: true },
  { id: 'ga:7dayUsers',
    name: '7 Day Active Users',
    description: 'Total number of 7-day active users for each day in the requested time period. At least one of ga:nthDay, ga:date, or ga:day must be specified as a dimension to query this metric. For a given date, the returned value will be the total number of unique users for the 7-day period ending on the given date.',
    is_active: true },
  { id: 'ga:14dayUsers',
    name: '14 Day Active Users',
    description: 'Total number of 14-day active users for each day in the requested time period. At least one of ga:nthDay, ga:date, or ga:day must be specified as a dimension to query this metric. For a given date, the returned value will be the total number of unique users for the 14-day period ending on the given date.',
    is_active: true },
  { id: 'ga:30dayUsers',
    name: '30 Day Active Users',
    description: 'Total number of 30-day active users for each day in the requested time period. At least one of ga:nthDay, ga:date, or ga:day must be specified as a dimension to query this metric. For a given date, the returned value will be the total number of unique users for the 30-day period ending on the given date.',
    is_active: true },
  { id: 'ga:sessions',
    name: 'Sessions',
    description: 'The total number of sessions.',
    is_active: true },
  { id: 'ga:visits',
    name: 'Sessions',
    description: 'The total number of sessions.',
    is_active: false },
  { id: 'ga:bounces',
    name: 'Bounces',
    description: 'The total number of single page (or single interaction hit) sessions for the property.',
    is_active: true },
  { id: 'ga:entranceBounceRate',
    name: 'Bounce Rate',
    description: 'This dimension is deprecated and will be removed soon. Please use ga:bounceRate instead.',
    is_active: false },
  { id: 'ga:bounceRate',
    name: 'Bounce Rate',
    description: 'The percentage of single-page session (i.e., session in which the person left the property from the first page).',
    is_active: true },
  { id: 'ga:visitBounceRate',
    name: 'Bounce Rate',
    description: 'The percentage of single-page session (i.e., session in which the person left the property from the first page).',
    is_active: false },
  { id: 'ga:sessionDuration',
    name: 'Session Duration',
    description: 'Total duration (in seconds) of users\' sessions.',
    is_active: true },
  { id: 'ga:timeOnSite',
    name: 'Session Duration',
    description: 'Total duration (in seconds) of users\' sessions.',
    is_active: false },
  { id: 'ga:avgSessionDuration',
    name: 'Avg. Session Duration',
    description: 'The average duration (in seconds) of users\' sessions.',
    is_active: true },
  { id: 'ga:avgTimeOnSite',
    name: 'Avg. Session Duration',
    description: 'The average duration (in seconds) of users\' sessions.',
    is_active: false },
  { id: 'ga:organicSearches',
    name: 'Organic Searches',
    description: 'The number of organic searches happened in a session. This metric is search engine agnostic.',
    is_active: true },
  { id: 'ga:impressions',
    name: 'Impressions',
    description: 'Total number of campaign impressions.',
    is_active: true },
  { id: 'ga:adClicks',
    name: 'Clicks',
    description: 'Total number of times users have clicked on an ad to reach the property.',
    is_active: true },
  { id: 'ga:adCost',
    name: 'Cost',
    description: 'Derived cost for the advertising campaign. Its currency is the one you set in the AdWords account.',
    is_active: true },
  { id: 'ga:CPM',
    name: 'CPM',
    description: 'Cost per thousand impressions.',
    is_active: true },
  { id: 'ga:CPC',
    name: 'CPC',
    description: 'Cost to advertiser per click.',
    is_active: true },
  { id: 'ga:CTR',
    name: 'CTR',
    description: 'Click-through-rate for the ad. This is equal to the number of clicks divided by the number of impressions for the ad (e.g., how many times users clicked on one of the ads where that ad appeared).',
    is_active: true },
  { id: 'ga:costPerTransaction',
    name: 'Cost per Transaction',
    description: 'The cost per transaction for the property.',
    is_active: true },
  { id: 'ga:costPerGoalConversion',
    name: 'Cost per Goal Conversion',
    description: 'The cost per goal conversion for the property.',
    is_active: true },
  { id: 'ga:costPerConversion',
    name: 'Cost per Conversion',
    description: 'The cost per conversion (including ecommerce and goal conversions) for the property.',
    is_active: true },
  { id: 'ga:RPC',
    name: 'RPC',
    description: 'RPC or revenue-per-click, the average revenue (from ecommerce sales and/or goal value) you received for each click on one of the search ads.',
    is_active: true },
  { id: 'ga:ROI',
    name: 'ROI',
    description: 'This metric is deprecated and will be removed soon. Please use ga:ROAS instead.',
    is_active: false },
  { id: 'ga:margin',
    name: 'Margin',
    description: 'This metric is deprecated and will be removed soon. Please use ga:ROAS instead.',
    is_active: false },
  { id: 'ga:ROAS',
    name: 'ROAS',
    description: 'Return On Ad Spend (ROAS) is the total transaction revenue and goal value divided by derived advertising cost.',
    is_active: true },
  { id: 'ga:goalXXStarts',
    name: 'Goal XX Starts',
    description: 'The total number of starts for the requested goal number.',
    is_active: true },
  { id: 'ga:goalStartsAll',
    name: 'Goal Starts',
    description: 'Total number of starts for all goals defined in the profile.',
    is_active: true },
  { id: 'ga:goalXXCompletions',
    name: 'Goal XX Completions',
    description: 'The total number of completions for the requested goal number.',
    is_active: true },
  { id: 'ga:goalCompletionsAll',
    name: 'Goal Completions',
    description: 'Total number of completions for all goals defined in the profile.',
    is_active: true },
  { id: 'ga:goalXXValue',
    name: 'Goal XX Value',
    description: 'The total numeric value for the requested goal number.',
    is_active: true },
  { id: 'ga:goalValueAll',
    name: 'Goal Value',
    description: 'Total numeric value for all goals defined in the profile.',
    is_active: true },
  { id: 'ga:goalValuePerSession',
    name: 'Per Session Goal Value',
    description: 'The average goal value of a session.',
    is_active: true },
  { id: 'ga:goalValuePerVisit',
    name: 'Per Session Goal Value',
    description: 'The average goal value of a session.',
    is_active: false },
  { id: 'ga:goalXXConversionRate',
    name: 'Goal XX Conversion Rate',
    description: 'Percentage of sessions resulting in a conversion to the requested goal number.',
    is_active: true },
  { id: 'ga:goalConversionRateAll',
    name: 'Goal Conversion Rate',
    description: 'The percentage of sessions which resulted in a conversion to at least one of the goals.',
    is_active: true },
  { id: 'ga:goalXXAbandons',
    name: 'Goal XX Abandoned Funnels',
    description: 'The number of times users started conversion activity on the requested goal number without actually completing it.',
    is_active: true },
  { id: 'ga:goalAbandonsAll',
    name: 'Abandoned Funnels',
    description: 'The overall number of times users started goals without actually completing them.',
    is_active: true },
  { id: 'ga:goalXXAbandonRate',
    name: 'Goal XX Abandonment Rate',
    description: 'The rate at which the requested goal number was abandoned.',
    is_active: true },
  { id: 'ga:goalAbandonRateAll',
    name: 'Total Abandonment Rate',
    description: 'Goal abandonment rate.',
    is_active: true },
  { id: 'ga:socialActivities',
    name: 'Data Hub Activities',
    description: 'Total number of activities where a content URL was shared or mentioned on a social data hub partner network.',
    is_active: false },
  { id: 'ga:pageValue',
    name: 'Page Value',
    description: 'The average value of this page or set of pages, which is equal to (ga:transactionRevenue + ga:goalValueAll) / ga:uniquePageviews.',
    is_active: true },
  { id: 'ga:entrances',
    name: 'Entrances',
    description: 'The number of entrances to the property measured as the first pageview in a session, typically used with landingPagePath.',
    is_active: true },
  { id: 'ga:entranceRate',
    name: 'Entrances / Pageviews',
    description: 'The percentage of pageviews in which this page was the entrance.',
    is_active: true },
  { id: 'ga:pageviews',
    name: 'Pageviews',
    description: 'The total number of pageviews for the property.',
    is_active: true },
  { id: 'ga:pageviewsPerSession',
    name: 'Pages / Session',
    description: 'The average number of pages viewed during a session, including repeated views of a single page.',
    is_active: true },
  { id: 'ga:pageviewsPerVisit',
    name: 'Pages / Session',
    description: 'The average number of pages viewed during a session, including repeated views of a single page.',
    is_active: false },
  { id: 'ga:contentGroupUniqueViewsXX',
    name: 'Unique Views XX',
    description: 'The number of unique content group views. Content group views in different sessions are counted as unique content group views. Both the pagePath and pageTitle are used to determine content group view uniqueness.',
    is_active: true },
  { id: 'ga:uniquePageviews',
    name: 'Unique Pageviews',
    description: 'Unique Pageviews is the number of sessions during which the specified page was viewed at least once. A unique pageview is counted for each page URL + page title combination.',
    is_active: true },
  { id: 'ga:timeOnPage',
    name: 'Time on Page',
    description: 'Time (in seconds) users spent on a particular page, calculated by subtracting the initial view time for a particular page from the initial view time for a subsequent page. This metric does not apply to exit pages of the property.',
    is_active: true },
  { id: 'ga:avgTimeOnPage',
    name: 'Avg. Time on Page',
    description: 'The average time users spent viewing this page or a set of pages.',
    is_active: true },
  { id: 'ga:exits',
    name: 'Exits',
    description: 'The number of exits from the property.',
    is_active: true },
  { id: 'ga:exitRate',
    name: '% Exit',
    description: 'The percentage of exits from the property that occurred out of the total pageviews.',
    is_active: true },
  { id: 'ga:searchResultViews',
    name: 'Results Pageviews',
    description: 'The number of times a search result page was viewed.',
    is_active: true },
  { id: 'ga:searchUniques',
    name: 'Total Unique Searches',
    description: 'Total number of unique keywords from internal searches within a session. For example, if "shoes" was searched for 3 times in a session, it would be counted only once.',
    is_active: true },
  { id: 'ga:avgSearchResultViews',
    name: 'Results Pageviews / Search',
    description: 'The average number of times people viewed a page as a result of a search.',
    is_active: true },
  { id: 'ga:searchSessions',
    name: 'Sessions with Search',
    description: 'The total number of sessions that included an internal search.',
    is_active: true },
  { id: 'ga:searchVisits',
    name: 'Sessions with Search',
    description: 'The total number of sessions that included an internal search.',
    is_active: false },
  { id: 'ga:percentSessionsWithSearch',
    name: '% Sessions with Search',
    description: 'The percentage of sessions with search.',
    is_active: true },
  { id: 'ga:percentVisitsWithSearch',
    name: '% Sessions with Search',
    description: 'The percentage of sessions with search.',
    is_active: false },
  { id: 'ga:searchDepth',
    name: 'Search Depth',
    description: 'The total number of subsequent page views made after a use of the site\'s internal search feature.',
    is_active: true },
  { id: 'ga:avgSearchDepth',
    name: 'Average Search Depth',
    description: 'The average number of pages people viewed after performing a search.',
    is_active: true },
  { id: 'ga:searchRefinements',
    name: 'Search Refinements',
    description: 'The total number of times a refinement (transition) occurs between internal keywords search within a session. For example, if the sequence of keywords is "shoes", "shoes", "pants", "pants", this metric will be one because the transition between "shoes" and "pants" is different.',
    is_active: true },
  { id: 'ga:percentSearchRefinements',
    name: '% Search Refinements',
    description: 'The percentage of the number of times a refinement (i.e., transition) occurs between internal keywords search within a session.',
    is_active: true },
  { id: 'ga:searchDuration',
    name: 'Time after Search',
    description: 'The session duration when the site\'s internal search feature is used.',
    is_active: true },
  { id: 'ga:avgSearchDuration',
    name: 'Time after Search',
    description: 'The average time (in seconds) users, after searching, spent on the property.',
    is_active: true },
  { id: 'ga:searchExits',
    name: 'Search Exits',
    description: 'The number of exits on the site that occurred following a search result from the site\'s internal search feature.',
    is_active: true },
  { id: 'ga:searchExitRate',
    name: '% Search Exits',
    description: 'The percentage of searches that resulted in an immediate exit from the property.',
    is_active: true },
  { id: 'ga:searchGoalXXConversionRate',
    name: 'Site Search Goal XX Conversion Rate',
    description: 'The percentage of search sessions (i.e., sessions that included at least one search) which resulted in a conversion to the requested goal number.',
    is_active: true },
  { id: 'ga:searchGoalConversionRateAll',
    name: 'Site Search Goal Conversion Rate',
    description: 'The percentage of search sessions (i.e., sessions that included at least one search) which resulted in a conversion to at least one of the goals.',
    is_active: true },
  { id: 'ga:goalValueAllPerSearch',
    name: 'Per Search Goal Value',
    description: 'The average goal value of a search.',
    is_active: true },
  { id: 'ga:pageLoadTime',
    name: 'Page Load Time (ms)',
    description: 'Total time (in milliseconds), from pageview initiation (e.g., a click on a page link) to page load completion in the browser, the pages in the sample set take to load.',
    is_active: true },
  { id: 'ga:pageLoadSample',
    name: 'Page Load Sample',
    description: 'The sample set (or count) of pageviews used to calculate the average page load time.',
    is_active: true },
  { id: 'ga:avgPageLoadTime',
    name: 'Avg. Page Load Time (sec)',
    description: 'The average time (in seconds) pages from the sample set take to load, from initiation of the pageview (e.g., a click on a page link) to load completion in the browser.',
    is_active: true },
  { id: 'ga:domainLookupTime',
    name: 'Domain Lookup Time (ms)',
    description: 'The total time (in milliseconds) all samples spent in DNS lookup for this page.',
    is_active: true },
  { id: 'ga:avgDomainLookupTime',
    name: 'Avg. Domain Lookup Time (sec)',
    description: 'The average time (in seconds) spent in DNS lookup for this page.',
    is_active: true },
  { id: 'ga:pageDownloadTime',
    name: 'Page Download Time (ms)',
    description: 'The total time (in milliseconds) to download this page among all samples.',
    is_active: true },
  { id: 'ga:avgPageDownloadTime',
    name: 'Avg. Page Download Time (sec)',
    description: 'The average time (in seconds) to download this page.',
    is_active: true },
  { id: 'ga:redirectionTime',
    name: 'Redirection Time (ms)',
    description: 'The total time (in milliseconds) all samples spent in redirects before fetching this page. If there are no redirects, this is 0.',
    is_active: true },
  { id: 'ga:avgRedirectionTime',
    name: 'Avg. Redirection Time (sec)',
    description: 'The average time (in seconds) spent in redirects before fetching this page. If there are no redirects, this is 0.',
    is_active: true },
  { id: 'ga:serverConnectionTime',
    name: 'Server Connection Time (ms)',
    description: 'Total time (in milliseconds) all samples spent in establishing a TCP connection to this page.',
    is_active: true },
  { id: 'ga:avgServerConnectionTime',
    name: 'Avg. Server Connection Time (sec)',
    description: 'The average time (in seconds) spent in establishing a TCP connection to this page.',
    is_active: true },
  { id: 'ga:serverResponseTime',
    name: 'Server Response Time (ms)',
    description: 'The total time (in milliseconds) the site\'s server takes to respond to users\' requests among all samples; this includes the network time from users\' locations to the server.',
    is_active: true },
  { id: 'ga:avgServerResponseTime',
    name: 'Avg. Server Response Time (sec)',
    description: 'The average time (in seconds) the site\'s server takes to respond to users\' requests; this includes the network time from users\' locations to the server.',
    is_active: true },
  { id: 'ga:speedMetricsSample',
    name: 'Speed Metrics Sample',
    description: 'The sample set (or count) of pageviews used to calculate the averages of site speed metrics. This metric is used in all site speed average calculations, including avgDomainLookupTime, avgPageDownloadTime, avgRedirectionTime, avgServerConnectionTime, and avgServerResponseTime.',
    is_active: true },
  { id: 'ga:domInteractiveTime',
    name: 'Document Interactive Time (ms)',
    description: 'The time (in milliseconds), including the network time from users\' locations to the site\'s server, the browser takes to parse the document (DOMInteractive). At this time, users can interact with the Document Object Model even though it is not fully loaded.',
    is_active: true },
  { id: 'ga:avgDomInteractiveTime',
    name: 'Avg. Document Interactive Time (sec)',
    description: 'The average time (in seconds), including the network time from users\' locations to the site\'s server, the browser takes to parse the document and execute deferred and parser-inserted scripts.',
    is_active: true },
  { id: 'ga:domContentLoadedTime',
    name: 'Document Content Loaded Time (ms)',
    description: 'The time (in milliseconds), including the network time from users\' locations to the site\'s server, the browser takes to parse the document and execute deferred and parser-inserted scripts (DOMContentLoaded). When parsing of the document is finished, the Document Object Model (DOM) is ready, but the referenced style sheets, images, and subframes may not be finished loading. This is often the starting point of Javascript framework execution, e.g., JQuery\'s onready() callback.',
    is_active: true },
  { id: 'ga:avgDomContentLoadedTime',
    name: 'Avg. Document Content Loaded Time (sec)',
    description: 'The average time (in seconds) the browser takes to parse the document.',
    is_active: true },
  { id: 'ga:domLatencyMetricsSample',
    name: 'DOM Latency Metrics Sample',
    description: 'Sample set (or count) of pageviews used to calculate the averages for site speed DOM metrics. This metric is used to calculate ga:avgDomContentLoadedTime and ga:avgDomInteractiveTime.',
    is_active: true },
  { id: 'ga:screenviews',
    name: 'Screen Views',
    description: 'The total number of screenviews.',
    is_active: true },
  { id: 'ga:appviews',
    name: 'Screen Views',
    description: 'The total number of screenviews.',
    is_active: false },
  { id: 'ga:uniqueScreenviews',
    name: 'Unique Screen Views',
    description: 'The number of unique screen views. Screen views in different sessions are counted as separate screen views.',
    is_active: true },
  { id: 'ga:uniqueAppviews',
    name: 'Unique Screen Views',
    description: 'The number of unique screen views. Screen views in different sessions are counted as separate screen views.',
    is_active: false },
  { id: 'ga:screenviewsPerSession',
    name: 'Screens / Session',
    description: 'The average number of screenviews per session.',
    is_active: true },
  { id: 'ga:appviewsPerVisit',
    name: 'Screens / Session',
    description: 'The average number of screenviews per session.',
    is_active: false },
  { id: 'ga:timeOnScreen',
    name: 'Time on Screen',
    description: 'The time spent viewing the current screen.',
    is_active: true },
  { id: 'ga:avgScreenviewDuration',
    name: 'Avg. Time on Screen',
    description: 'Average time (in seconds) users spent on a screen.',
    is_active: true },
  { id: 'ga:totalEvents',
    name: 'Total Events',
    description: 'The total number of events for the profile, across all categories.',
    is_active: true },
  { id: 'ga:uniqueDimensionCombinations',
    name: 'Unique Dimension Combinations',
    description: 'Unique Dimension Combinations counts the number of unique dimension-value combinations for each dimension in a report. This lets you build combined (concatenated) dimensions post-processing, which allows for more flexible reporting without having to update your tracking implementation or use additional custom-dimension slots. For more information, see https://support.google.com/analytics/answer/7084499.',
    is_active: true },
  { id: 'ga:uniqueEvents',
    name: 'Unique Events',
    description: 'The number of unique events. Events in different sessions are counted as separate events.',
    is_active: false },
  { id: 'ga:eventValue',
    name: 'Event Value',
    description: 'Total value of events for the profile.',
    is_active: true },
  { id: 'ga:avgEventValue',
    name: 'Avg. Value',
    description: 'The average value of an event.',
    is_active: true },
  { id: 'ga:sessionsWithEvent',
    name: 'Sessions with Event',
    description: 'The total number of sessions with events.',
    is_active: true },
  { id: 'ga:visitsWithEvent',
    name: 'Sessions with Event',
    description: 'The total number of sessions with events.',
    is_active: false },
  { id: 'ga:eventsPerSessionWithEvent',
    name: 'Events / Session with Event',
    description: 'The average number of events per session with event.',
    is_active: true },
  { id: 'ga:eventsPerVisitWithEvent',
    name: 'Events / Session with Event',
    description: 'The average number of events per session with event.',
    is_active: false },
  { id: 'ga:transactions',
    name: 'Transactions',
    description: 'The total number of transactions.',
    is_active: true },
  { id: 'ga:transactionsPerSession',
    name: 'Ecommerce Conversion Rate',
    description: 'The average number of transactions in a session.',
    is_active: true },
  { id: 'ga:transactionsPerVisit',
    name: 'Ecommerce Conversion Rate',
    description: 'The average number of transactions in a session.',
    is_active: false },
  { id: 'ga:transactionRevenue',
    name: 'Revenue',
    description: 'The total sale revenue (excluding shipping and tax) of the transaction.',
    is_active: true },
  { id: 'ga:revenuePerTransaction',
    name: 'Average Order Value',
    description: 'The average revenue of an ecommerce transaction.',
    is_active: true },
  { id: 'ga:transactionRevenuePerSession',
    name: 'Per Session Value',
    description: 'Average transaction revenue for a session.',
    is_active: true },
  { id: 'ga:transactionRevenuePerVisit',
    name: 'Per Session Value',
    description: 'Average transaction revenue for a session.',
    is_active: false },
  { id: 'ga:transactionShipping',
    name: 'Shipping',
    description: 'The total cost of shipping.',
    is_active: true },
  { id: 'ga:transactionTax',
    name: 'Tax',
    description: 'Total tax for the transaction.',
    is_active: true },
  { id: 'ga:totalValue',
    name: 'Total Value',
    description: 'Total value for the property (including total revenue and total goal value).',
    is_active: true },
  { id: 'ga:itemQuantity',
    name: 'Quantity',
    description: 'Total number of items purchased. For example, if users purchase 2 frisbees and 5 tennis balls, this will be 7.',
    is_active: true },
  { id: 'ga:uniquePurchases',
    name: 'Unique Purchases',
    description: 'The number of product sets purchased. For example, if users purchase 2 frisbees and 5 tennis balls from the site, this will be 2.',
    is_active: true },
  { id: 'ga:revenuePerItem',
    name: 'Average Price',
    description: 'The average revenue per item.',
    is_active: true },
  { id: 'ga:itemRevenue',
    name: 'Product Revenue',
    description: 'The total revenue from purchased product items.',
    is_active: true },
  { id: 'ga:itemsPerPurchase',
    name: 'Average QTY',
    description: 'The average quantity of this item (or group of items) sold per purchase.',
    is_active: true },
  { id: 'ga:localTransactionRevenue',
    name: 'Local Revenue',
    description: 'Transaction revenue in local currency.',
    is_active: true },
  { id: 'ga:localTransactionShipping',
    name: 'Local Shipping',
    description: 'Transaction shipping cost in local currency.',
    is_active: true },
  { id: 'ga:localTransactionTax',
    name: 'Local Tax',
    description: 'Transaction tax in local currency.',
    is_active: true },
  { id: 'ga:localItemRevenue',
    name: 'Local Product Revenue',
    description: 'Product revenue in local currency.',
    is_active: true },
  { id: 'ga:socialInteractions',
    name: 'Social Actions',
    description: 'The total number of social interactions.',
    is_active: true },
  { id: 'ga:uniqueSocialInteractions',
    name: 'Unique Social Actions',
    description: 'The number of sessions during which the specified social action(s) occurred at least once. This is based on the the unique combination of socialInteractionNetwork, socialInteractionAction, and socialInteractionTarget.',
    is_active: true },
  { id: 'ga:socialInteractionsPerSession',
    name: 'Actions Per Social Session',
    description: 'The number of social interactions per session.',
    is_active: true },
  { id: 'ga:socialInteractionsPerVisit',
    name: 'Actions Per Social Session',
    description: 'The number of social interactions per session.',
    is_active: false },
  { id: 'ga:userTimingValue',
    name: 'User Timing (ms)',
    description: 'Total number of milliseconds for user timing.',
    is_active: true },
  { id: 'ga:userTimingSample',
    name: 'User Timing Sample',
    description: 'The number of hits sent for a particular userTimingCategory, userTimingLabel, or userTimingVariable.',
    is_active: true },
  { id: 'ga:avgUserTimingValue',
    name: 'Avg. User Timing (sec)',
    description: 'The average elapsed time.',
    is_active: true },
  { id: 'ga:exceptions',
    name: 'Exceptions',
    description: 'The number of exceptions sent to Google Analytics.',
    is_active: true },
  { id: 'ga:exceptionsPerScreenview',
    name: 'Exceptions / Screen',
    description: 'The number of exceptions thrown divided by the number of screenviews.',
    is_active: true },
  { id: 'ga:fatalExceptions',
    name: 'Crashes',
    description: 'The number of exceptions where isFatal is set to true.',
    is_active: true },
  { id: 'ga:fatalExceptionsPerScreenview',
    name: 'Crashes / Screen',
    description: 'The number of fatal exceptions thrown divided by the number of screenviews.',
    is_active: true },
  { id: 'ga:metricXX',
    name: 'Custom Metric XX Value',
    description: 'The value of the requested custom metric, where XX refers to the number or index of the custom metric. Note that the data type of ga:metricXX can be INTEGER, CURRENCY, or TIME.',
    is_active: true },
  { id: 'ga:dcmFloodlightQuantity',
    name: 'DFA Conversions',
    description: 'The number of DCM Floodlight conversions (Analytics 360 only).',
    is_active: true },
  { id: 'ga:dcmFloodlightRevenue',
    name: 'DFA Revenue',
    description: 'DCM Floodlight revenue (Analytics 360 only).',
    is_active: true },
  { id: 'ga:adsenseRevenue',
    name: 'AdSense Revenue',
    description: 'The total revenue from AdSense ads.',
    is_active: true },
  { id: 'ga:adsenseAdUnitsViewed',
    name: 'AdSense Ad Units Viewed',
    description: 'The number of AdSense ad units viewed. An ad unit is a set of ads displayed as a result of one piece of the AdSense ad code. For details, see https://support.google.com/adsense/answer/32715?hl=en.',
    is_active: true },
  { id: 'ga:adsenseAdsViewed',
    name: 'AdSense Impressions',
    description: 'The number of AdSense ads viewed. Multiple ads can be displayed within an ad Unit.',
    is_active: true },
  { id: 'ga:adsenseAdsClicks',
    name: 'AdSense Ads Clicked',
    description: 'The number of times AdSense ads on the site were clicked.',
    is_active: true },
  { id: 'ga:adsensePageImpressions',
    name: 'AdSense Page Impressions',
    description: 'The number of pageviews during which an AdSense ad was displayed. A page impression can have multiple ad Units.',
    is_active: true },
  { id: 'ga:adsenseCTR',
    name: 'AdSense CTR',
    description: 'The percentage of page impressions resulted in a click on an AdSense ad.',
    is_active: true },
  { id: 'ga:adsenseECPM',
    name: 'AdSense eCPM',
    description: 'The estimated cost per thousand page impressions. It is the AdSense Revenue per 1,000 page impressions.',
    is_active: true },
  { id: 'ga:adsenseExits',
    name: 'AdSense Exits',
    description: 'The number of sessions ended due to a user clicking on an AdSense ad.',
    is_active: true },
  { id: 'ga:adsenseViewableImpressionPercent',
    name: 'AdSense Viewable Impression %',
    description: 'The percentage of viewable impressions.',
    is_active: true },
  { id: 'ga:adsenseCoverage',
    name: 'AdSense Coverage',
    description: 'The percentage of ad requests that returned at least one ad.',
    is_active: true },
  { id: 'ga:adxImpressions',
    name: 'AdX Impressions',
    description: 'An Ad Exchange ad impression is reported whenever an individual ad is displayed on the website. For example, if a page with two ad units is viewed once, we\'ll display two impressions.',
    is_active: true },
  { id: 'ga:adxCoverage',
    name: 'AdX Coverage',
    description: 'Coverage is the percentage of ad requests that returned at least one ad. Generally, coverage can help identify sites where the Ad Exchange account isn\'t able to provide targeted ads. (Ad Impressions / Total Ad Requests) * 100',
    is_active: true },
  { id: 'ga:adxMonetizedPageviews',
    name: 'AdX Monetized Pageviews',
    description: 'This measures the total number of pageviews on the property that were shown with an ad from the linked Ad Exchange account. Note that a single page can have multiple ad units.',
    is_active: true },
  { id: 'ga:adxImpressionsPerSession',
    name: 'AdX Impressions / Session',
    description: 'The ratio of Ad Exchange ad impressions to Analytics sessions (Ad Impressions / Analytics Sessions).',
    is_active: true },
  { id: 'ga:adxViewableImpressionsPercent',
    name: 'AdX Viewable Impressions %',
    description: 'The percentage of viewable ad impressions. An impression is considered a viewable impression when it has appeared within users\' browsers and has the opportunity to be seen.',
    is_active: true },
  { id: 'ga:adxClicks',
    name: 'AdX Clicks',
    description: 'The number of times AdX ads were clicked on the site.',
    is_active: true },
  { id: 'ga:adxCTR',
    name: 'AdX CTR',
    description: 'The percentage of pageviews that resulted in a click on an Ad Exchange ad.',
    is_active: true },
  { id: 'ga:adxRevenue',
    name: 'AdX Revenue',
    description: 'The total estimated revenue from Ad Exchange ads.',
    is_active: true },
  { id: 'ga:adxRevenuePer1000Sessions',
    name: 'AdX Revenue / 1000 Sessions',
    description: 'The total estimated revenue from Ad Exchange ads per 1,000 Analytics sessions. Note that this metric is based on sessions to the site, not on ad impressions.',
    is_active: true },
  { id: 'ga:adxECPM',
    name: 'AdX eCPM',
    description: 'The effective cost per thousand pageviews. It is the Ad Exchange revenue per 1,000 pageviews.',
    is_active: true },
  { id: 'ga:dfpImpressions',
    name: 'DFP Impressions',
    description: 'A DFP ad impression is reported whenever an individual ad is displayed on the website. For example, if a page with two ad units is viewed once, we\'ll display two impressions (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:dfpCoverage',
    name: 'DFP Coverage',
    description: 'Coverage is the percentage of ad requests that returned at least one ad. Generally, coverage can help identify sites where the DFP account isn\'t able to provide targeted ads. (Ad Impressions / Total Ad Requests) * 100 (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:dfpMonetizedPageviews',
    name: 'DFP Monetized Pageviews',
    description: 'This measures the total number of pageviews on the property that were shown with an ad from the linked DFP account. Note that a single page can have multiple ad units (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:dfpImpressionsPerSession',
    name: 'DFP Impressions / Session',
    description: 'The ratio of DFP ad impressions to Analytics sessions (Ad Impressions / Analytics Sessions) (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:dfpViewableImpressionsPercent',
    name: 'DFP Viewable Impressions %',
    description: 'The percentage of viewable ad impressions. An impression is considered a viewable impression when it has appeared within users\' browsers and has the opportunity to be seen (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:dfpClicks',
    name: 'DFP Clicks',
    description: 'The number of times DFP ads were clicked on the site (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:dfpCTR',
    name: 'DFP CTR',
    description: 'The percentage of pageviews that resulted in a click on an DFP ad (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:dfpRevenue',
    name: 'DFP Revenue',
    description: 'DFP revenue is an estimate of the total ad revenue based on served impressions (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:dfpRevenuePer1000Sessions',
    name: 'DFP Revenue / 1000 Sessions',
    description: 'The total estimated revenue from DFP ads per 1,000 Analytics sessions. Note that this metric is based on sessions to the site, not on ad impressions (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:dfpECPM',
    name: 'DFP eCPM',
    description: 'The effective cost per thousand pageviews. It is the DFP revenue per 1,000 pageviews (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:backfillImpressions',
    name: 'DFP Backfill Impressions',
    description: 'Backfill Impressions is the sum of all AdSense or Ad Exchance ad impressions served as backfill through DFP. An ad impression is reported whenever an individual ad is displayed on the website. For example, if a page with two ad units is viewed once, we\'ll display two impressions (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:backfillCoverage',
    name: 'DFP Backfill Coverage',
    description: 'Backfill Coverage is the percentage of backfill ad requests that returned at least one ad. Generally, coverage can help identify sites where the publisher account isn\'t able to provide targeted ads. (Ad Impressions / Total Ad Requests) * 100. If both AdSense and Ad Exchange are providing backfill ads, this metric is the weighted average of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:backfillMonetizedPageviews',
    name: 'DFP Backfill Monetized Pageviews',
    description: 'This measures the total number of pageviews on the property that were shown with at least one ad from the linked backfill account(s). Note that a single monetized pageview can include multiple ad impressions (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:backfillImpressionsPerSession',
    name: 'DFP Backfill Impressions / Session',
    description: 'The ratio of backfill ad impressions to Analytics sessions (Ad Impressions / Analytics Sessions). If both AdSense and Ad Exchange are providing backfill ads, this metric is the sum of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:backfillViewableImpressionsPercent',
    name: 'DFP Backfill Viewable Impressions %',
    description: 'The percentage of backfill ad impressions that were viewable. An impression is considered a viewable impression when it has appeared within the users\' browsers and had the opportunity to be seen. If AdSense and Ad Exchange are both providing backfill ads, this metric is the weighted average of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:backfillClicks',
    name: 'DFP Backfill Clicks',
    description: 'The number of times backfill ads were clicked on the site. If AdSense and Ad Exchange are both providing backfill ads, this metric is the sum of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:backfillCTR',
    name: 'DFP Backfill CTR',
    description: 'The percentage of backfill impressions that resulted in a click on an ad. If AdSense and Ad Exchange are both providing backfill ads, this metric is the weighted average of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:backfillRevenue',
    name: 'DFP Backfill Revenue',
    description: 'The total estimated revenue from backfill ads. If AdSense and Ad Exchange are both providing backfill ads, this metric is the sum of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:backfillRevenuePer1000Sessions',
    name: 'DFP Backfill Revenue / 1000 Sessions',
    description: 'The total estimated revenue from backfill ads per 1,000 Analytics sessions. Note that this metric is based on sessions to the site and not ad impressions. If both AdSense and Ad Exchange are providing backfill ads, this metric is the sum of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:backfillECPM',
    name: 'DFP Backfill eCPM',
    description: 'The effective cost per thousand pageviews. It is the DFP Backfill Revenue per 1,000 pageviews. If both AdSense and Ad Exchange are providing backfill ads, this metric is the sum of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled).',
    is_active: true },
  { id: 'ga:buyToDetailRate',
    name: 'Buy-to-Detail Rate',
    description: 'Unique purchases divided by views of product detail pages (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:calcMetric_<NAME>',
    name: 'Calculated Metric',
    description: 'The value of the requested calculated metric, where <NAME> refers to the user-defined name of the calculated metric. Note that the data type of ga:calcMetric_<NAME> can be FLOAT, INTEGER, CURRENCY, TIME, or PERCENT. For details, see https://support.google.com/analytics/answer/6121409.',
    is_active: true },
  { id: 'ga:cartToDetailRate',
    name: 'Cart-to-Detail Rate',
    description: 'Product adds divided by views of product details (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:cohortActiveUsers',
    name: 'Users',
    description: 'This metric is relevant in the context of ga:cohortNthDay/ga:cohortNthWeek/ga:cohortNthMonth. It indicates the number of users in the cohort who are active in the time window corresponding to the cohort nth day/week/month. For example, for ga:cohortNthWeek = 1, number of users (in the cohort) who are active in week 1. If a request doesn\'t have any of ga:cohortNthDay/ga:cohortNthWeek/ga:cohortNthMonth, this metric will have the same value as ga:cohortTotalUsers.',
    is_active: true },
  { id: 'ga:cohortAppviewsPerUser',
    name: 'Appviews per User',
    description: 'App views per user for a cohort.',
    is_active: true },
  { id: 'ga:cohortAppviewsPerUserWithLifetimeCriteria',
    name: 'Appviews Per User (LTV)',
    description: 'App views per user for the acquisition dimension for a cohort.',
    is_active: true },
  { id: 'ga:cohortGoalCompletionsPerUser',
    name: 'Goal Completions per User',
    description: 'Goal completions per user for the acquisition dimension for a cohort.',
    is_active: true },
  { id: 'ga:cohortGoalCompletionsPerUserWithLifetimeCriteria',
    name: 'Goal Completions Per User (LTV)',
    description: 'Goal completions per user for a cohort.',
    is_active: true },
  { id: 'ga:cohortPageviewsPerUser',
    name: 'Pageviews per User',
    description: 'Pageviews per user for a cohort.',
    is_active: true },
  { id: 'ga:cohortPageviewsPerUserWithLifetimeCriteria',
    name: 'Pageviews Per User (LTV)',
    description: 'Pageviews per user for the acquisition dimension for a cohort.',
    is_active: true },
  { id: 'ga:cohortRetentionRate',
    name: 'User Retention',
    description: 'Cohort retention rate.',
    is_active: true },
  { id: 'ga:cohortRevenuePerUser',
    name: 'Revenue per User',
    description: 'Revenue per user for a cohort.',
    is_active: true },
  { id: 'ga:cohortRevenuePerUserWithLifetimeCriteria',
    name: 'Revenue Per User (LTV)',
    description: 'Revenue per user for the acquisition dimension for a cohort.',
    is_active: true },
  { id: 'ga:cohortSessionDurationPerUser',
    name: 'Session Duration per User',
    description: 'Session duration per user for a cohort.',
    is_active: true },
  { id: 'ga:cohortSessionDurationPerUserWithLifetimeCriteria',
    name: 'Session Duration Per User (LTV)',
    description: 'Session duration per user for the acquisition dimension for a cohort.',
    is_active: true },
  { id: 'ga:cohortSessionsPerUser',
    name: 'Sessions per User',
    description: 'Sessions per user for a cohort.',
    is_active: true },
  { id: 'ga:cohortSessionsPerUserWithLifetimeCriteria',
    name: 'Sessions Per User (LTV)',
    description: 'Sessions per user for the acquisition dimension for a cohort.',
    is_active: true },
  { id: 'ga:cohortTotalUsers',
    name: 'Total Users',
    description: 'Number of users belonging to the cohort, also known as cohort size.',
    is_active: true },
  { id: 'ga:cohortTotalUsersWithLifetimeCriteria',
    name: 'Users',
    description: 'This is relevant in the context of a request which has the dimensions ga:acquisitionTrafficChannel/ga:acquisitionSource/ga:acquisitionMedium/ga:acquisitionCampaign. It represents the number of users in the cohorts who are acquired through the current channel/source/medium/campaign. For example, for ga:acquisitionTrafficChannel=Direct, it represents the number users in the cohort, who were acquired directly. If none of these mentioned dimensions are present, then its value is equal to ga:cohortTotalUsers.',
    is_active: true },
  { id: 'ga:correlationScore',
    name: 'Correlation Score',
    description: 'Correlation Score for related products.',
    is_active: true },
  { id: 'ga:dbmCPA',
    name: 'DBM eCPA',
    description: 'DBM Revenue eCPA (Analytics 360 only, requires integration with DBM).',
    is_active: true },
  { id: 'ga:dbmCPC',
    name: 'DBM eCPC',
    description: 'DBM Revenue eCPC (Analytics 360 only, requires integration with DBM).',
    is_active: true },
  { id: 'ga:dbmCPM',
    name: 'DBM eCPM',
    description: 'DBM Revenue eCPM (Analytics 360 only, requires integration with DBM).',
    is_active: true },
  { id: 'ga:dbmCTR',
    name: 'DBM CTR',
    description: 'DBM CTR (Analytics 360 only, requires integration with DBM).',
    is_active: true },
  { id: 'ga:dbmClicks',
    name: 'DBM Clicks',
    description: 'DBM Total Clicks (Analytics 360 only, requires integration with DBM).',
    is_active: true },
  { id: 'ga:dbmConversions',
    name: 'DBM Conversions',
    description: 'DBM Total Conversions (Analytics 360 only, requires integration with DBM).',
    is_active: true },
  { id: 'ga:dbmCost',
    name: 'DBM Cost',
    description: 'DBM Cost (Analytics 360 only, requires integration with DBM).',
    is_active: true },
  { id: 'ga:dbmImpressions',
    name: 'DBM Impressions',
    description: 'DBM Total Impressions (Analytics 360 only, requires integration with DBM).',
    is_active: true },
  { id: 'ga:dbmROAS',
    name: 'DBM ROAS',
    description: 'DBM ROAS (Analytics 360 only, requires integration with DBM).',
    is_active: true },
  { id: 'ga:dcmCPC',
    name: 'DFA CPC',
    description: 'DCM Cost Per Click (Analytics 360 only).',
    is_active: true },
  { id: 'ga:dcmCTR',
    name: 'DFA CTR',
    description: 'DCM Click Through Rate (Analytics 360 only).',
    is_active: true },
  { id: 'ga:dcmClicks',
    name: 'DFA Clicks',
    description: 'DCM Total Clicks (Analytics 360 only).',
    is_active: true },
  { id: 'ga:dcmCost',
    name: 'DFA Cost',
    description: 'DCM Total Cost (Analytics 360 only).',
    is_active: true },
  { id: 'ga:dcmImpressions',
    name: 'DFA Impressions',
    description: 'DCM Total Impressions (Analytics 360 only).',
    is_active: true },
  { id: 'ga:dcmMargin',
    name: 'DFA Margin',
    description: 'This metric is deprecated and will be removed soon. Please use ga:dcmROAS instead.',
    is_active: false },
  { id: 'ga:dcmROAS',
    name: 'DFA ROAS',
    description: 'DCM Return On Ad Spend (ROAS) (Analytics 360 only).',
    is_active: true },
  { id: 'ga:dcmROI',
    name: 'DFA ROI',
    description: 'This metric is deprecated and will be removed soon. Please use ga:dcmROAS instead.',
    is_active: false },
  { id: 'ga:dcmRPC',
    name: 'DFA RPC',
    description: 'DCM Revenue Per Click (Analytics 360 only).',
    is_active: true },
  { id: 'ga:dsCPC',
    name: 'DS CPC',
    description: 'DS Cost to advertiser per click (Analytics 360 only, requires integration with DS).',
    is_active: true },
  { id: 'ga:dsCTR',
    name: 'DS CTR',
    description: 'DS Click Through Rate (Analytics 360 only, requires integration with DS).',
    is_active: true },
  { id: 'ga:dsClicks',
    name: 'DS Clicks',
    description: 'DS Clicks (Analytics 360 only, requires integration with DS).',
    is_active: true },
  { id: 'ga:dsCost',
    name: 'DS Cost',
    description: 'DS Cost (Analytics 360 only, requires integration with DS).',
    is_active: true },
  { id: 'ga:dsImpressions',
    name: 'DS Impressions',
    description: 'DS Impressions (Analytics 360 only, requires integration with DS).',
    is_active: true },
  { id: 'ga:dsProfit',
    name: 'DS Profit',
    description: 'DS Profie (Analytics 360 only, requires integration with DS).',
    is_active: true },
  { id: 'ga:dsReturnOnAdSpend',
    name: 'DS ROAS',
    description: 'DS Return On Ad Spend (Analytics 360 only, requires integration with DS).',
    is_active: true },
  { id: 'ga:dsRevenuePerClick',
    name: 'DS RPC',
    description: 'DS Revenue Per Click (Analytics 360 only, requires integration with DS).',
    is_active: true },
  { id: 'ga:hits',
    name: 'Hits',
    description: 'Total number of hits for the view (profile). This metric sums all hit types, including pageview, custom event, ecommerce, and other types. Because this metric is based on the view (profile), not on the property, it is not the same as the property\'s hit volume.',
    is_active: true },
  { id: 'ga:internalPromotionCTR',
    name: 'Internal Promotion CTR',
    description: 'The rate at which users clicked through to view the internal promotion (ga:internalPromotionClicks / ga:internalPromotionViews) - (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:internalPromotionClicks',
    name: 'Internal Promotion Clicks',
    description: 'The number of clicks on an internal promotion (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:internalPromotionViews',
    name: 'Internal Promotion Views',
    description: 'The number of views of an internal promotion (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:localProductRefundAmount',
    name: 'Local Product Refund Amount',
    description: 'Refund amount in local currency for a given product (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:localRefundAmount',
    name: 'Local Refund Amount',
    description: 'Total refund amount in local currency for the transaction (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:productAddsToCart',
    name: 'Product Adds To Cart',
    description: 'Number of times the product was added to the shopping cart (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:productCheckouts',
    name: 'Product Checkouts',
    description: 'Number of times the product was included in the check-out process (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:productDetailViews',
    name: 'Product Detail Views',
    description: 'Number of times users viewed the product-detail page (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:productListCTR',
    name: 'Product List CTR',
    description: 'The rate at which users clicked through on the product in a product list (ga:productListClicks / ga:productListViews) - (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:productListClicks',
    name: 'Product List Clicks',
    description: 'Number of times users clicked the product when it appeared in the product list (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:productListViews',
    name: 'Product List Views',
    description: 'Number of times the product appeared in a product list (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:productRefundAmount',
    name: 'Product Refund Amount',
    description: 'Total refund amount associated with the product (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:productRefunds',
    name: 'Product Refunds',
    description: 'Number of times a refund was issued for the product (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:productRemovesFromCart',
    name: 'Product Removes From Cart',
    description: 'Number of times the product was removed from the shopping cart (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:productRevenuePerPurchase',
    name: 'Product Revenue per Purchase',
    description: 'Average product revenue per purchase (commonly used with Product Coupon Code) (ga:itemRevenue / ga:uniquePurchases) - (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:quantityAddedToCart',
    name: 'Quantity Added To Cart',
    description: 'Number of product units added to the shopping cart (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:quantityCheckedOut',
    name: 'Quantity Checked Out',
    description: 'Number of product units included in check out (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:quantityRefunded',
    name: 'Quantity Refunded',
    description: 'Number of product units refunded (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:quantityRemovedFromCart',
    name: 'Quantity Removed From Cart',
    description: 'Number of product units removed from a shopping cart (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:queryProductQuantity',
    name: 'Queried Product Quantity',
    description: 'Quantity of the product being queried.',
    is_active: true },
  { id: 'ga:refundAmount',
    name: 'Refund Amount',
    description: 'Currency amount refunded for a transaction (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:relatedProductQuantity',
    name: 'Related Product Quantity',
    description: 'Quantity of the related product.',
    is_active: true },
  { id: 'ga:revenuePerUser',
    name: 'Revenue per User',
    description: 'The total sale revenue (excluding shipping and tax) of the transaction divided by the total number of users.',
    is_active: true },
  { id: 'ga:sessionsPerUser',
    name: 'Number of Sessions per User',
    description: 'The total number of sessions divided by the total number of users.',
    is_active: true },
  { id: 'ga:totalRefunds',
    name: 'Refunds',
    description: 'Number of refunds that have been issued (Enhanced Ecommerce).',
    is_active: true },
  { id: 'ga:transactionsPerUser',
    name: 'Transactions per User',
    description: 'Total number of transactions divided by total number of users.',
    is_active: true }
];

export const fields = {
  "ga:userType": {
    "display_name": "User Type",
    "description": "A boolean, either New Visitor or Returning Visitor, indicating if the users are new or returning."
  },
  "ga:visitorType": {
    "display_name": "User Type",
    "description": "A boolean, either New Visitor or Returning Visitor, indicating if the users are new or returning."
  },
  "ga:sessionCount": {
    "display_name": "Count of Sessions",
    "description": "The session index for a user. Each session from a unique user will get its own incremental index starting from 1 for the first session. Subsequent sessions do not change previous session indices. For example, if a user has 4 sessions to the website, sessionCount for that user will have 4 distinct values of '1' through '4'."
  },
  "ga:visitCount": {
    "display_name": "Count of Sessions",
    "description": "The session index for a user. Each session from a unique user will get its own incremental index starting from 1 for the first session. Subsequent sessions do not change previous session indices. For example, if a user has 4 sessions to the website, sessionCount for that user will have 4 distinct values of '1' through '4'."
  },
  "ga:daysSinceLastSession": {
    "display_name": "Days Since Last Session",
    "description": "The number of days elapsed since users last visited the property, used to calculate user loyalty."
  },
  "ga:daysSinceLastVisit": {
    "display_name": "Days Since Last Session",
    "description": "The number of days elapsed since users last visited the property, used to calculate user loyalty."
  },
  "ga:userDefinedValue": {
    "display_name": "User Defined Value",
    "description": "The value provided when defining custom user segments for the property."
  },
  "ga:users": {
    "display_name": "Users",
    "description": "The total number of users for the requested time period."
  },
  "ga:visitors": {
    "display_name": "Users",
    "description": "The total number of users for the requested time period."
  },
  "ga:newUsers": {
    "display_name": "New Users",
    "description": "The number of users whose session was marked as a first-time session."
  },
  "ga:newVisits": {
    "display_name": "New Users",
    "description": "The number of users whose session was marked as a first-time session."
  },
  "ga:percentNewSessions": {
    "display_name": "% New Sessions",
    "description": "The percentage of sessions by users who had never visited the property before."
  },
  "ga:percentNewVisits": {
    "display_name": "% New Sessions",
    "description": "The percentage of sessions by users who had never visited the property before."
  },
  "ga:1dayUsers": {
    "display_name": "1 Day Active Users",
    "description": "Total number of 1-day active users for each day in the requested time period. At least one of ga:nthDay, ga:date, or ga:day must be specified as a dimension to query this metric. For a given date, the returned value will be the total number of unique users for the 1-day period ending on the given date."
  },
  "ga:7dayUsers": {
    "display_name": "7 Day Active Users",
    "description": "Total number of 7-day active users for each day in the requested time period. At least one of ga:nthDay, ga:date, or ga:day must be specified as a dimension to query this metric. For a given date, the returned value will be the total number of unique users for the 7-day period ending on the given date."
  },
  "ga:14dayUsers": {
    "display_name": "14 Day Active Users",
    "description": "Total number of 14-day active users for each day in the requested time period. At least one of ga:nthDay, ga:date, or ga:day must be specified as a dimension to query this metric. For a given date, the returned value will be the total number of unique users for the 14-day period ending on the given date."
  },
  "ga:30dayUsers": {
    "display_name": "30 Day Active Users",
    "description": "Total number of 30-day active users for each day in the requested time period. At least one of ga:nthDay, ga:date, or ga:day must be specified as a dimension to query this metric. For a given date, the returned value will be the total number of unique users for the 30-day period ending on the given date."
  },
  "ga:sessionDurationBucket": {
    "display_name": "Session Duration",
    "description": "The length (returned as a string) of a session measured in seconds and reported in second increments."
  },
  "ga:visitLength": {
    "display_name": "Session Duration",
    "description": "The length (returned as a string) of a session measured in seconds and reported in second increments."
  },
  "ga:sessions": {
    "display_name": "Sessions",
    "description": "The total number of sessions."
  },
  "ga:visits": {
    "display_name": "Sessions",
    "description": "The total number of sessions."
  },
  "ga:bounces": {
    "display_name": "Bounces",
    "description": "The total number of single page (or single interaction hit) sessions for the property."
  },
  "ga:entranceBounceRate": {
    "display_name": "Bounce Rate",
    "description": "This dimension is deprecated and will be removed soon. Please use ga:bounceRate instead."
  },
  "ga:bounceRate": {
    "display_name": "Bounce Rate",
    "description": "The percentage of single-page session (i.e., session in which the person left the property from the first page)."
  },
  "ga:visitBounceRate": {
    "display_name": "Bounce Rate",
    "description": "The percentage of single-page session (i.e., session in which the person left the property from the first page)."
  },
  "ga:sessionDuration": {
    "display_name": "Session Duration",
    "description": "Total duration (in seconds) of users' sessions."
  },
  "ga:timeOnSite": {
    "display_name": "Session Duration",
    "description": "Total duration (in seconds) of users' sessions."
  },
  "ga:avgSessionDuration": {
    "display_name": "Avg. Session Duration",
    "description": "The average duration (in seconds) of users' sessions."
  },
  "ga:avgTimeOnSite": {
    "display_name": "Avg. Session Duration",
    "description": "The average duration (in seconds) of users' sessions."
  },
  "ga:referralPath": {
    "display_name": "Referral Path",
    "description": "The path of the referring URL (e.g., document.referrer). If someone places on their webpage a link to the property, this is the path of the page containing the referring link."
  },
  "ga:fullReferrer": {
    "display_name": "Full Referrer",
    "description": "The full referring URL including the hostname and path."
  },
  "ga:campaign": {
    "display_name": "Campaign",
    "description": "For manual campaign tracking, it is the value of the utm_campaign campaign tracking parameter. For AdWords autotagging, it is the name(s) of the online ad campaign(s) you use for the property. If you use neither, its value is (not set)."
  },
  "ga:source": {
    "display_name": "Source",
    "description": "The source of referrals. For manual campaign tracking, it is the value of the utm_source campaign tracking parameter. For AdWords autotagging, it is google. If you use neither, it is the domain of the source (e.g., document.referrer) referring the users. It may also contain a port address. If users arrived without a referrer, its value is (direct)."
  },
  "ga:medium": {
    "display_name": "Medium",
    "description": "The type of referrals. For manual campaign tracking, it is the value of the utm_medium campaign tracking parameter. For AdWords autotagging, it is cpc. If users came from a search engine detected by Google Analytics, it is organic. If the referrer is not a search engine, it is referral. If users came directly to the property and document.referrer is empty, its value is (none)."
  },
  "ga:sourceMedium": {
    "display_name": "Source / Medium",
    "description": "Combined values of ga:source and ga:medium."
  },
  "ga:keyword": {
    "display_name": "Keyword",
    "description": "For manual campaign tracking, it is the value of the utm_term campaign tracking parameter. For AdWords autotagging or when users use organic search to reach the property, it contains the keywords used to reach the property. Otherwise its value is (not set)."
  },
  "ga:adContent": {
    "display_name": "Ad Content",
    "description": "For manual campaign tracking, it is the value of the utm_content campaign tracking parameter. For AdWords autotagging, it is the first line of the text for the online Ad campaign. If you use mad libs for the AdWords content, it contains the keywords you provided for the mad libs keyword match. If you use none of the above, its value is (not set)."
  },
  "ga:socialNetwork": {
    "display_name": "Social Network",
    "description": "The social network name. This can be related to the referring social network for traffic sources, or to the social network for social data hub activities; e.g., Google+, Blogger."
  },
  "ga:hasSocialSourceReferral": {
    "display_name": "Social Source Referral",
    "description": "A boolean, either Yes or No, indicates whether sessions to the property are from a social source."
  },
  "ga:organicSearches": {
    "display_name": "Organic Searches",
    "description": "The number of organic searches happened in a session. This metric is search engine agnostic."
  },
  "ga:adGroup": {
    "display_name": "Ad Group",
    "description": "The name of the AdWords ad group."
  },
  "ga:adSlot": {
    "display_name": "Ad Slot",
    "description": "The location (Top, RHS, or not set) of the advertisement on the hosting page."
  },
  "ga:adSlotPosition": {
    "display_name": "Ad Slot Position",
    "description": "This dimension is deprecated and will soon be removed."
  },
  "ga:adDistributionNetwork": {
    "display_name": "Ad Distribution Network",
    "description": "The network (Content, Search, Search partners, etc.) used to deliver the ads."
  },
  "ga:adMatchType": {
    "display_name": "Query Match Type",
    "description": "The match type (Phrase, Exact, Broad, etc.) applied for users' search term. Ads on the content network are identified as \"Content network\". For details, see https://support.google.com/adwords/answer/2472708?hl=en."
  },
  "ga:adKeywordMatchType": {
    "display_name": "Keyword Match Type",
    "description": "The match type (Phrase, Exact, or Broad) applied to the keywords. For details, see https://support.google.com/adwords/answer/2472708."
  },
  "ga:adMatchedQuery": {
    "display_name": "Search Query",
    "description": "The search query that triggered impressions."
  },
  "ga:adPlacementDomain": {
    "display_name": "Placement Domain",
    "description": "The domain where the ads on the content network were placed."
  },
  "ga:adPlacementUrl": {
    "display_name": "Placement URL",
    "description": "The URL where the ads were placed on the content network."
  },
  "ga:adFormat": {
    "display_name": "Ad Format",
    "description": "The AdWords ad format (Text, Image, Flash, Video, etc.)."
  },
  "ga:adTargetingType": {
    "display_name": "Targeting Type",
    "description": "This (keyword, placement, or vertical targeting) indicates how the AdWords ads were targeted."
  },
  "ga:adTargetingOption": {
    "display_name": "Placement Type",
    "description": "It is Automatic placements or Managed placements, indicating how the ads were managed on the content network."
  },
  "ga:adDisplayUrl": {
    "display_name": "Display URL",
    "description": "The URL the AdWords ads displayed."
  },
  "ga:adDestinationUrl": {
    "display_name": "Destination URL",
    "description": "The URL to which the AdWords ads referred traffic."
  },
  "ga:adwordsCustomerID": {
    "display_name": "AdWords Customer ID",
    "description": "Customer's AdWords ID, corresponding to AdWords API AccountInfo.customerId."
  },
  "ga:adwordsCampaignID": {
    "display_name": "AdWords Campaign ID",
    "description": "AdWords API Campaign.id."
  },
  "ga:adwordsAdGroupID": {
    "display_name": "AdWords Ad Group ID",
    "description": "AdWords API AdGroup.id."
  },
  "ga:adwordsCreativeID": {
    "display_name": "AdWords Creative ID",
    "description": "AdWords API Ad.id."
  },
  "ga:adwordsCriteriaID": {
    "display_name": "AdWords Criteria ID",
    "description": "AdWords API Criterion.id. The geographical targeting Criteria IDs are listed at https://developers.google.com/analytics/devguides/collection/protocol/v1/geoid."
  },
  "ga:impressions": {
    "display_name": "Impressions",
    "description": "Total number of campaign impressions."
  },
  "ga:adClicks": {
    "display_name": "Clicks",
    "description": "Total number of times users have clicked on an ad to reach the property."
  },
  "ga:adCost": {
    "display_name": "Cost",
    "description": "Derived cost for the advertising campaign. Its currency is the one you set in the AdWords account."
  },
  "ga:CPM": {
    "display_name": "CPM",
    "description": "Cost per thousand impressions."
  },
  "ga:CPC": {
    "display_name": "CPC",
    "description": "Cost to advertiser per click."
  },
  "ga:CTR": {
    "display_name": "CTR",
    "description": "Click-through-rate for the ad. This is equal to the number of clicks divided by the number of impressions for the ad (e.g., how many times users clicked on one of the ads where that ad appeared)."
  },
  "ga:costPerTransaction": {
    "display_name": "Cost per Transaction",
    "description": "The cost per transaction for the property."
  },
  "ga:costPerGoalConversion": {
    "display_name": "Cost per Goal Conversion",
    "description": "The cost per goal conversion for the property."
  },
  "ga:costPerConversion": {
    "display_name": "Cost per Conversion",
    "description": "The cost per conversion (including ecommerce and goal conversions) for the property."
  },
  "ga:RPC": {
    "display_name": "RPC",
    "description": "RPC or revenue-per-click, the average revenue (from ecommerce sales and/or goal value) you received for each click on one of the search ads."
  },
  "ga:ROI": {
    "display_name": "ROI",
    "description": "This metric is deprecated and will be removed soon. Please use ga:ROAS instead."
  },
  "ga:margin": {
    "display_name": "Margin",
    "description": "This metric is deprecated and will be removed soon. Please use ga:ROAS instead."
  },
  "ga:ROAS": {
    "display_name": "ROAS",
    "description": "Return On Ad Spend (ROAS) is the total transaction revenue and goal value divided by derived advertising cost."
  },
  "ga:adQueryWordCount": {
    "display_name": "Query Word Count",
    "description": "The number of words in the search query."
  },
  "ga:goalCompletionLocation": {
    "display_name": "Goal Completion Location",
    "description": "The page path or screen name that matched any destination type goal completion."
  },
  "ga:goalPreviousStep1": {
    "display_name": "Goal Previous Step - 1",
    "description": "The page path or screen name that matched any destination type goal, one step prior to the goal completion location."
  },
  "ga:goalPreviousStep2": {
    "display_name": "Goal Previous Step - 2",
    "description": "The page path or screen name that matched any destination type goal, two steps prior to the goal completion location."
  },
  "ga:goalPreviousStep3": {
    "display_name": "Goal Previous Step - 3",
    "description": "The page path or screen name that matched any destination type goal, three steps prior to the goal completion location."
  },
  "ga:goalXXStarts": {
    "display_name": "Goal XX Starts",
    "description": "The total number of starts for the requested goal number."
  },
  "ga:goalStartsAll": {
    "display_name": "Goal Starts",
    "description": "Total number of starts for all goals defined in the profile."
  },
  "ga:goalXXCompletions": {
    "display_name": "Goal XX Completions",
    "description": "The total number of completions for the requested goal number."
  },
  "ga:goalCompletionsAll": {
    "display_name": "Goal Completions",
    "description": "Total number of completions for all goals defined in the profile."
  },
  "ga:goalXXValue": {
    "display_name": "Goal XX Value",
    "description": "The total numeric value for the requested goal number."
  },
  "ga:goalValueAll": {
    "display_name": "Goal Value",
    "description": "Total numeric value for all goals defined in the profile."
  },
  "ga:goalValuePerSession": {
    "display_name": "Per Session Goal Value",
    "description": "The average goal value of a session."
  },
  "ga:goalValuePerVisit": {
    "display_name": "Per Session Goal Value",
    "description": "The average goal value of a session."
  },
  "ga:goalXXConversionRate": {
    "display_name": "Goal XX Conversion Rate",
    "description": "Percentage of sessions resulting in a conversion to the requested goal number."
  },
  "ga:goalConversionRateAll": {
    "display_name": "Goal Conversion Rate",
    "description": "The percentage of sessions which resulted in a conversion to at least one of the goals."
  },
  "ga:goalXXAbandons": {
    "display_name": "Goal XX Abandoned Funnels",
    "description": "The number of times users started conversion activity on the requested goal number without actually completing it."
  },
  "ga:goalAbandonsAll": {
    "display_name": "Abandoned Funnels",
    "description": "The overall number of times users started goals without actually completing them."
  },
  "ga:goalXXAbandonRate": {
    "display_name": "Goal XX Abandonment Rate",
    "description": "The rate at which the requested goal number was abandoned."
  },
  "ga:goalAbandonRateAll": {
    "display_name": "Total Abandonment Rate",
    "description": "Goal abandonment rate."
  },
  "ga:browser": {
    "display_name": "Browser",
    "description": "The name of users' browsers, for example, Internet Explorer or Firefox."
  },
  "ga:browserVersion": {
    "display_name": "Browser Version",
    "description": "The version of users' browsers, for example, 2.0.0.14."
  },
  "ga:operatingSystem": {
    "display_name": "Operating System",
    "description": "Users' operating system, for example, Windows, Linux, Macintosh, or iOS."
  },
  "ga:operatingSystemVersion": {
    "display_name": "Operating System Version",
    "description": "The version of users' operating system, i.e., XP for Windows, PPC for Macintosh."
  },
  "ga:isMobile": {
    "display_name": "Mobile (Including Tablet)",
    "description": "This dimension is deprecated and will be removed soon. Please use ga:deviceCategory instead (e.g., ga:deviceCategory==mobile)."
  },
  "ga:isTablet": {
    "display_name": "Tablet",
    "description": "This dimension is deprecated and will be removed soon. Please use ga:deviceCategory instead (e.g., ga:deviceCategory==tablet)."
  },
  "ga:mobileDeviceBranding": {
    "display_name": "Mobile Device Branding",
    "description": "Mobile manufacturer or branded name."
  },
  "ga:mobileDeviceModel": {
    "display_name": "Mobile Device Model",
    "description": "Mobile device model."
  },
  "ga:mobileInputSelector": {
    "display_name": "Mobile Input Selector",
    "description": "Selector (e.g., touchscreen, joystick, clickwheel, stylus) used on the mobile device."
  },
  "ga:mobileDeviceInfo": {
    "display_name": "Mobile Device Info",
    "description": "The branding, model, and marketing name used to identify the mobile device."
  },
  "ga:mobileDeviceMarketingName": {
    "display_name": "Mobile Device Marketing Name",
    "description": "The marketing name used for the mobile device."
  },
  "ga:deviceCategory": {
    "display_name": "Device Category",
    "description": "The type of device: desktop, tablet, or mobile."
  },
  "ga:continent": {
    "display_name": "Continent",
    "description": "Users' continent, derived from users' IP addresses or Geographical IDs."
  },
  "ga:subContinent": {
    "display_name": "Sub Continent",
    "description": "Users' sub-continent, derived from their IP addresses or Geographical IDs. For example, Polynesia or Northern Europe."
  },
  "ga:country": {
    "display_name": "Country",
    "description": "Users' country, derived from their IP addresses or Geographical IDs."
  },
  "ga:region": {
    "display_name": "Region",
    "description": "Users' region, derived from their IP addresses or Geographical IDs. In U.S., a region is a state, New York, for example."
  },
  "ga:metro": {
    "display_name": "Metro",
    "description": "The Designated Market Area (DMA) from where traffic arrived."
  },
  "ga:city": {
    "display_name": "City",
    "description": "Users' city, derived from their IP addresses or Geographical IDs."
  },
  "ga:latitude": {
    "display_name": "Latitude",
    "description": "The approximate latitude of users' city, derived from their IP addresses or Geographical IDs. Locations north of the equator have positive latitudes and locations south of the equator have negative latitudes."
  },
  "ga:longitude": {
    "display_name": "Longitude",
    "description": "The approximate latitude of users' city, derived from their IP addresses or Geographical IDs. Locations north of the equator have positive latitudes and locations south of the equator have negative latitudes."
  },
  "ga:networkDomain": {
    "display_name": "Network Domain",
    "description": "The domain name of users' ISP, derived from the domain name registered to the ISP's IP address."
  },
  "ga:networkLocation": {
    "display_name": "Service Provider",
    "description": "The names of the service providers used to reach the property. For example, if most users of the website come via the major cable internet service providers, its value will be these service providers' names."
  },
  "ga:flashVersion": {
    "display_name": "Flash Version",
    "description": "The version of Flash, including minor versions, supported by users' browsers."
  },
  "ga:javaEnabled": {
    "display_name": "Java Support",
    "description": "A boolean, either Yes or No, indicating whether Java is enabled in users' browsers."
  },
  "ga:language": {
    "display_name": "Language",
    "description": "The language, in ISO-639 code format (e.g., en-gb for British English), provided by the HTTP Request for the browser."
  },
  "ga:screenColors": {
    "display_name": "Screen Colors",
    "description": "The color depth of users' monitors, retrieved from the DOM of users' browsers. For example, 4-bit, 8-bit, 24-bit, or undefined-bit."
  },
  "ga:sourcePropertyDisplayName": {
    "display_name": "Source Property Display Name",
    "description": "Source property display name of roll-up properties. This is valid for only roll-up properties."
  },
  "ga:sourcePropertyTrackingId": {
    "display_name": "Source Property Tracking ID",
    "description": "Source property tracking ID of roll-up properties. This is valid for only roll-up properties."
  },
  "ga:screenResolution": {
    "display_name": "Screen Resolution",
    "description": "Resolution of users' screens, for example, 1024x738."
  },
  "ga:socialActivityEndorsingUrl": {
    "display_name": "Endorsing URL",
    "description": "For a social data hub activity, this is the URL of the social activity (e.g., the Google+ post URL, the blog comment URL, etc.)."
  },
  "ga:socialActivityDisplayName": {
    "display_name": "Display Name",
    "description": "For a social data hub activity, this is the title of the social activity posted by the social network users."
  },
  "ga:socialActivityPost": {
    "display_name": "Social Activity Post",
    "description": "For a social data hub activity, this is the content of the social activity (e.g., the content of a message posted in Google+) posted by social network users."
  },
  "ga:socialActivityTimestamp": {
    "display_name": "Social Activity Timestamp",
    "description": "For a social data hub activity, this is the time when the social activity occurred on the social network."
  },
  "ga:socialActivityUserHandle": {
    "display_name": "Social User Handle",
    "description": "For a social data hub activity, this is the social network handle (e.g., name or ID) of users who initiated the social activity."
  },
  "ga:socialActivityUserPhotoUrl": {
    "display_name": "User Photo URL",
    "description": "For a social data hub activity, this is the URL of the photo associated with users' social network profiles."
  },
  "ga:socialActivityUserProfileUrl": {
    "display_name": "User Profile URL",
    "description": "For a social data hub activity, this is the URL of the associated users' social network profiles."
  },
  "ga:socialActivityContentUrl": {
    "display_name": "Shared URL",
    "description": "For a social data hub activity, this is the URL shared by the associated social network users."
  },
  "ga:socialActivityTagsSummary": {
    "display_name": "Social Tags Summary",
    "description": "For a social data hub activity, this is a comma-separated set of tags associated with the social activity."
  },
  "ga:socialActivityAction": {
    "display_name": "Originating Social Action",
    "description": "For a social data hub activity, this represents the type of social action (e.g., vote, comment, +1, etc.) associated with the activity."
  },
  "ga:socialActivityNetworkAction": {
    "display_name": "Social Network and Action",
    "description": "For a social data hub activity, this is the type of social action and the social network where the activity originated."
  },
  "ga:socialActivities": {
    "display_name": "Data Hub Activities",
    "description": "Total number of activities where a content URL was shared or mentioned on a social data hub partner network."
  },
  "ga:hostname": {
    "display_name": "Hostname",
    "description": "The hostname from which the tracking request was made."
  },
  "ga:pagePath": {
    "display_name": "Page",
    "description": "A page on the website specified by path and/or query parameters. Use this with hostname to get the page's full URL."
  },
  "ga:pagePathLevel1": {
    "display_name": "Page path level 1",
    "description": "This dimension rolls up all the page paths in the first hierarchical level in pagePath."
  },
  "ga:pagePathLevel2": {
    "display_name": "Page path level 2",
    "description": "This dimension rolls up all the page paths in the second hierarchical level in pagePath."
  },
  "ga:pagePathLevel3": {
    "display_name": "Page path level 3",
    "description": "This dimension rolls up all the page paths in the third hierarchical level in pagePath."
  },
  "ga:pagePathLevel4": {
    "display_name": "Page path level 4",
    "description": "This dimension rolls up all the page paths into hierarchical levels. Up to 4 pagePath levels maybe specified. All additional levels in the pagePath hierarchy are also rolled up in this dimension."
  },
  "ga:pageTitle": {
    "display_name": "Page Title",
    "description": "The page's title. Multiple pages might have the same page title."
  },
  "ga:landingPagePath": {
    "display_name": "Landing Page",
    "description": "The first page in users' sessions, or the landing page."
  },
  "ga:secondPagePath": {
    "display_name": "Second Page",
    "description": "The second page in users' sessions."
  },
  "ga:exitPagePath": {
    "display_name": "Exit Page",
    "description": "The last page or exit page in users' sessions."
  },
  "ga:previousPagePath": {
    "display_name": "Previous Page Path",
    "description": "A page visited before another page on the same property, typically used with the pagePath dimension."
  },
  "ga:nextPagePath": {
    "display_name": "Next Page Path",
    "description": "This dimension is deprecated and will be removed soon. Please use ga:pagePath instead."
  },
  "ga:pageDepth": {
    "display_name": "Page Depth",
    "description": "The number of pages visited by users during a session. The value is a histogram that counts pageviews across a range of possible values. In this calculation, all sessions will have at least one pageview, and some percentage of sessions will have more."
  },
  "ga:pageValue": {
    "display_name": "Page Value",
    "description": "The average value of this page or set of pages, which is equal to (ga:transactionRevenue + ga:goalValueAll) / ga:uniquePageviews."
  },
  "ga:entrances": {
    "display_name": "Entrances",
    "description": "The number of entrances to the property measured as the first pageview in a session, typically used with landingPagePath."
  },
  "ga:entranceRate": {
    "display_name": "Entrances / Pageviews",
    "description": "The percentage of pageviews in which this page was the entrance."
  },
  "ga:pageviews": {
    "display_name": "Pageviews",
    "description": "The total number of pageviews for the property."
  },
  "ga:pageviewsPerSession": {
    "display_name": "Pages / Session",
    "description": "The average number of pages viewed during a session, including repeated views of a single page."
  },
  "ga:pageviewsPerVisit": {
    "display_name": "Pages / Session",
    "description": "The average number of pages viewed during a session, including repeated views of a single page."
  },
  "ga:contentGroupUniqueViewsXX": {
    "display_name": "Unique Views XX",
    "description": "The number of unique content group views. Content group views in different sessions are counted as unique content group views. Both the pagePath and pageTitle are used to determine content group view uniqueness."
  },
  "ga:uniquePageviews": {
    "display_name": "Unique Pageviews",
    "description": "Unique Pageviews is the number of sessions during which the specified page was viewed at least once. A unique pageview is counted for each page URL + page title combination."
  },
  "ga:timeOnPage": {
    "display_name": "Time on Page",
    "description": "Time (in seconds) users spent on a particular page, calculated by subtracting the initial view time for a particular page from the initial view time for a subsequent page. This metric does not apply to exit pages of the property."
  },
  "ga:avgTimeOnPage": {
    "display_name": "Avg. Time on Page",
    "description": "The average time users spent viewing this page or a set of pages."
  },
  "ga:exits": {
    "display_name": "Exits",
    "description": "The number of exits from the property."
  },
  "ga:exitRate": {
    "display_name": "% Exit",
    "description": "The percentage of exits from the property that occurred out of the total pageviews."
  },
  "ga:searchUsed": {
    "display_name": "Site Search Status",
    "description": "A boolean, either Visits With Site Search or Visits Without Site Search, to distinguish whether internal search was used in a session."
  },
  "ga:searchKeyword": {
    "display_name": "Search Term",
    "description": "Search term used within the property."
  },
  "ga:searchKeywordRefinement": {
    "display_name": "Refined Keyword",
    "description": "Subsequent keyword search term or string entered by users after a given initial string search."
  },
  "ga:searchCategory": {
    "display_name": "Site Search Category",
    "description": "The category used for the internal search if site search categories are enabled in the view. For example, the product category may be electronics, furniture, or clothing."
  },
  "ga:searchStartPage": {
    "display_name": "Start Page",
    "description": "The page where users initiated an internal search."
  },
  "ga:searchDestinationPage": {
    "display_name": "Destination Page",
    "description": "The page users immediately visited after performing an internal search on the site. This is usually the search results page."
  },
  "ga:searchAfterDestinationPage": {
    "display_name": "Search Destination Page",
    "description": "The page that users visited after performing an internal search on the site."
  },
  "ga:searchResultViews": {
    "display_name": "Results Pageviews",
    "description": "The number of times a search result page was viewed."
  },
  "ga:searchUniques": {
    "display_name": "Total Unique Searches",
    "description": "Total number of unique keywords from internal searches within a session. For example, if \"shoes\" was searched for 3 times in a session, it would be counted only once."
  },
  "ga:avgSearchResultViews": {
    "display_name": "Results Pageviews / Search",
    "description": "The average number of times people viewed a page as a result of a search."
  },
  "ga:searchSessions": {
    "display_name": "Sessions with Search",
    "description": "The total number of sessions that included an internal search."
  },
  "ga:searchVisits": {
    "display_name": "Sessions with Search",
    "description": "The total number of sessions that included an internal search."
  },
  "ga:percentSessionsWithSearch": {
    "display_name": "% Sessions with Search",
    "description": "The percentage of sessions with search."
  },
  "ga:percentVisitsWithSearch": {
    "display_name": "% Sessions with Search",
    "description": "The percentage of sessions with search."
  },
  "ga:searchDepth": {
    "display_name": "Search Depth",
    "description": "The total number of subsequent page views made after a use of the site's internal search feature."
  },
  "ga:avgSearchDepth": {
    "display_name": "Average Search Depth",
    "description": "The average number of pages people viewed after performing a search."
  },
  "ga:searchRefinements": {
    "display_name": "Search Refinements",
    "description": "The total number of times a refinement (transition) occurs between internal keywords search within a session. For example, if the sequence of keywords is \"shoes\", \"shoes\", \"pants\", \"pants\", this metric will be one because the transition between \"shoes\" and \"pants\" is different."
  },
  "ga:percentSearchRefinements": {
    "display_name": "% Search Refinements",
    "description": "The percentage of the number of times a refinement (i.e., transition) occurs between internal keywords search within a session."
  },
  "ga:searchDuration": {
    "display_name": "Time after Search",
    "description": "The session duration when the site's internal search feature is used."
  },
  "ga:avgSearchDuration": {
    "display_name": "Time after Search",
    "description": "The average time (in seconds) users, after searching, spent on the property."
  },
  "ga:searchExits": {
    "display_name": "Search Exits",
    "description": "The number of exits on the site that occurred following a search result from the site's internal search feature."
  },
  "ga:searchExitRate": {
    "display_name": "% Search Exits",
    "description": "The percentage of searches that resulted in an immediate exit from the property."
  },
  "ga:searchGoalXXConversionRate": {
    "display_name": "Site Search Goal XX Conversion Rate",
    "description": "The percentage of search sessions (i.e., sessions that included at least one search) which resulted in a conversion to the requested goal number."
  },
  "ga:searchGoalConversionRateAll": {
    "display_name": "Site Search Goal Conversion Rate",
    "description": "The percentage of search sessions (i.e., sessions that included at least one search) which resulted in a conversion to at least one of the goals."
  },
  "ga:goalValueAllPerSearch": {
    "display_name": "Per Search Goal Value",
    "description": "The average goal value of a search."
  },
  "ga:pageLoadTime": {
    "display_name": "Page Load Time (ms)",
    "description": "Total time (in milliseconds), from pageview initiation (e.g., a click on a page link) to page load completion in the browser, the pages in the sample set take to load."
  },
  "ga:pageLoadSample": {
    "display_name": "Page Load Sample",
    "description": "The sample set (or count) of pageviews used to calculate the average page load time."
  },
  "ga:avgPageLoadTime": {
    "display_name": "Avg. Page Load Time (sec)",
    "description": "The average time (in seconds) pages from the sample set take to load, from initiation of the pageview (e.g., a click on a page link) to load completion in the browser."
  },
  "ga:domainLookupTime": {
    "display_name": "Domain Lookup Time (ms)",
    "description": "The total time (in milliseconds) all samples spent in DNS lookup for this page."
  },
  "ga:avgDomainLookupTime": {
    "display_name": "Avg. Domain Lookup Time (sec)",
    "description": "The average time (in seconds) spent in DNS lookup for this page."
  },
  "ga:pageDownloadTime": {
    "display_name": "Page Download Time (ms)",
    "description": "The total time (in milliseconds) to download this page among all samples."
  },
  "ga:avgPageDownloadTime": {
    "display_name": "Avg. Page Download Time (sec)",
    "description": "The average time (in seconds) to download this page."
  },
  "ga:redirectionTime": {
    "display_name": "Redirection Time (ms)",
    "description": "The total time (in milliseconds) all samples spent in redirects before fetching this page. If there are no redirects, this is 0."
  },
  "ga:avgRedirectionTime": {
    "display_name": "Avg. Redirection Time (sec)",
    "description": "The average time (in seconds) spent in redirects before fetching this page. If there are no redirects, this is 0."
  },
  "ga:serverConnectionTime": {
    "display_name": "Server Connection Time (ms)",
    "description": "Total time (in milliseconds) all samples spent in establishing a TCP connection to this page."
  },
  "ga:avgServerConnectionTime": {
    "display_name": "Avg. Server Connection Time (sec)",
    "description": "The average time (in seconds) spent in establishing a TCP connection to this page."
  },
  "ga:serverResponseTime": {
    "display_name": "Server Response Time (ms)",
    "description": "The total time (in milliseconds) the site's server takes to respond to users' requests among all samples; this includes the network time from users' locations to the server."
  },
  "ga:avgServerResponseTime": {
    "display_name": "Avg. Server Response Time (sec)",
    "description": "The average time (in seconds) the site's server takes to respond to users' requests; this includes the network time from users' locations to the server."
  },
  "ga:speedMetricsSample": {
    "display_name": "Speed Metrics Sample",
    "description": "The sample set (or count) of pageviews used to calculate the averages of site speed metrics. This metric is used in all site speed average calculations, including avgDomainLookupTime, avgPageDownloadTime, avgRedirectionTime, avgServerConnectionTime, and avgServerResponseTime."
  },
  "ga:domInteractiveTime": {
    "display_name": "Document Interactive Time (ms)",
    "description": "The time (in milliseconds), including the network time from users' locations to the site's server, the browser takes to parse the document (DOMInteractive). At this time, users can interact with the Document Object Model even though it is not fully loaded."
  },
  "ga:avgDomInteractiveTime": {
    "display_name": "Avg. Document Interactive Time (sec)",
    "description": "The average time (in seconds), including the network time from users' locations to the site's server, the browser takes to parse the document and execute deferred and parser-inserted scripts."
  },
  "ga:domContentLoadedTime": {
    "display_name": "Document Content Loaded Time (ms)",
    "description": "The time (in milliseconds), including the network time from users' locations to the site's server, the browser takes to parse the document and execute deferred and parser-inserted scripts (DOMContentLoaded). When parsing of the document is finished, the Document Object Model (DOM) is ready, but the referenced style sheets, images, and subframes may not be finished loading. This is often the starting point of Javascript framework execution, e.g., JQuery's onready() callback."
  },
  "ga:avgDomContentLoadedTime": {
    "display_name": "Avg. Document Content Loaded Time (sec)",
    "description": "The average time (in seconds) the browser takes to parse the document."
  },
  "ga:domLatencyMetricsSample": {
    "display_name": "DOM Latency Metrics Sample",
    "description": "Sample set (or count) of pageviews used to calculate the averages for site speed DOM metrics. This metric is used to calculate ga:avgDomContentLoadedTime and ga:avgDomInteractiveTime."
  },
  "ga:appInstallerId": {
    "display_name": "App Installer ID",
    "description": "The ID of the app installer (e.g., Google Play Store) from which the app was downloaded. By default, the app installer ID is set by the PackageManager#getInstallerPackageName method."
  },
  "ga:appVersion": {
    "display_name": "App Version",
    "description": "The application version."
  },
  "ga:appName": {
    "display_name": "App Name",
    "description": "The application name."
  },
  "ga:appId": {
    "display_name": "App ID",
    "description": "The application ID."
  },
  "ga:screenName": {
    "display_name": "Screen Name",
    "description": "The name of the screen."
  },
  "ga:screenDepth": {
    "display_name": "Screen Depth",
    "description": "The number of screenviews (reported as a string) per session, useful for historgrams."
  },
  "ga:landingScreenName": {
    "display_name": "Landing Screen",
    "description": "The name of the first viewed screen."
  },
  "ga:exitScreenName": {
    "display_name": "Exit Screen",
    "description": "The name of the screen where users exited the application."
  },
  "ga:screenviews": {
    "display_name": "Screen Views",
    "description": "The total number of screenviews."
  },
  "ga:appviews": {
    "display_name": "Screen Views",
    "description": "The total number of screenviews."
  },
  "ga:uniqueScreenviews": {
    "display_name": "Unique Screen Views",
    "description": "The number of unique screen views. Screen views in different sessions are counted as separate screen views."
  },
  "ga:uniqueAppviews": {
    "display_name": "Unique Screen Views",
    "description": "The number of unique screen views. Screen views in different sessions are counted as separate screen views."
  },
  "ga:screenviewsPerSession": {
    "display_name": "Screens / Session",
    "description": "The average number of screenviews per session."
  },
  "ga:appviewsPerVisit": {
    "display_name": "Screens / Session",
    "description": "The average number of screenviews per session."
  },
  "ga:timeOnScreen": {
    "display_name": "Time on Screen",
    "description": "The time spent viewing the current screen."
  },
  "ga:avgScreenviewDuration": {
    "display_name": "Avg. Time on Screen",
    "description": "Average time (in seconds) users spent on a screen."
  },
  "ga:eventCategory": {
    "display_name": "Event Category",
    "description": "The event category."
  },
  "ga:eventAction": {
    "display_name": "Event Action",
    "description": "Event action."
  },
  "ga:eventLabel": {
    "display_name": "Event Label",
    "description": "Event label."
  },
  "ga:totalEvents": {
    "display_name": "Total Events",
    "description": "The total number of events for the profile, across all categories."
  },
  "ga:uniqueDimensionCombinations": {
    "display_name": "Unique Dimension Combinations",
    "description": "Unique Dimension Combinations counts the number of unique dimension-value combinations for each dimension in a report. This lets you build combined (concatenated) dimensions post-processing, which allows for more flexible reporting without having to update your tracking implementation or use additional custom-dimension slots. For more information, see https://support.google.com/analytics/answer/7084499."
  },
  "ga:uniqueEvents": {
    "display_name": "Unique Events",
    "description": "The number of unique events. Events in different sessions are counted as separate events."
  },
  "ga:eventValue": {
    "display_name": "Event Value",
    "description": "Total value of events for the profile."
  },
  "ga:avgEventValue": {
    "display_name": "Avg. Value",
    "description": "The average value of an event."
  },
  "ga:sessionsWithEvent": {
    "display_name": "Sessions with Event",
    "description": "The total number of sessions with events."
  },
  "ga:visitsWithEvent": {
    "display_name": "Sessions with Event",
    "description": "The total number of sessions with events."
  },
  "ga:eventsPerSessionWithEvent": {
    "display_name": "Events / Session with Event",
    "description": "The average number of events per session with event."
  },
  "ga:eventsPerVisitWithEvent": {
    "display_name": "Events / Session with Event",
    "description": "The average number of events per session with event."
  },
  "ga:transactionId": {
    "display_name": "Transaction ID",
    "description": "The transaction ID, supplied by the ecommerce tracking method, for the purchase in the shopping cart."
  },
  "ga:affiliation": {
    "display_name": "Affiliation",
    "description": "A product affiliation to designate a supplying company or brick and mortar location."
  },
  "ga:sessionsToTransaction": {
    "display_name": "Sessions to Transaction",
    "description": "The number of sessions between users' purchases and the related campaigns that lead to the purchases."
  },
  "ga:visitsToTransaction": {
    "display_name": "Sessions to Transaction",
    "description": "The number of sessions between users' purchases and the related campaigns that lead to the purchases."
  },
  "ga:daysToTransaction": {
    "display_name": "Days to Transaction",
    "description": "The number of days between users' purchases and the most recent campaign source prior to the purchase."
  },
  "ga:productSku": {
    "display_name": "Product SKU",
    "description": "The product SKU, defined in the ecommerce tracking application, for purchased items."
  },
  "ga:productName": {
    "display_name": "Product",
    "description": "The product name, supplied by the ecommerce tracking application, for purchased items."
  },
  "ga:productCategory": {
    "display_name": "Product Category",
    "description": "Any product variation (size, color) supplied by the ecommerce application for purchased items, not compatible with Enhanced Ecommerce."
  },
  "ga:currencyCode": {
    "display_name": "Currency Code",
    "description": "The local currency code (based on ISO 4217 standard) of the transaction."
  },
  "ga:transactions": {
    "display_name": "Transactions",
    "description": "The total number of transactions."
  },
  "ga:transactionsPerSession": {
    "display_name": "Ecommerce Conversion Rate",
    "description": "The average number of transactions in a session."
  },
  "ga:transactionsPerVisit": {
    "display_name": "Ecommerce Conversion Rate",
    "description": "The average number of transactions in a session."
  },
  "ga:transactionRevenue": {
    "display_name": "Revenue",
    "description": "The total sale revenue (excluding shipping and tax) of the transaction."
  },
  "ga:revenuePerTransaction": {
    "display_name": "Average Order Value",
    "description": "The average revenue of an ecommerce transaction."
  },
  "ga:transactionRevenuePerSession": {
    "display_name": "Per Session Value",
    "description": "Average transaction revenue for a session."
  },
  "ga:transactionRevenuePerVisit": {
    "display_name": "Per Session Value",
    "description": "Average transaction revenue for a session."
  },
  "ga:transactionShipping": {
    "display_name": "Shipping",
    "description": "The total cost of shipping."
  },
  "ga:transactionTax": {
    "display_name": "Tax",
    "description": "Total tax for the transaction."
  },
  "ga:totalValue": {
    "display_name": "Total Value",
    "description": "Total value for the property (including total revenue and total goal value)."
  },
  "ga:itemQuantity": {
    "display_name": "Quantity",
    "description": "Total number of items purchased. For example, if users purchase 2 frisbees and 5 tennis balls, this will be 7."
  },
  "ga:uniquePurchases": {
    "display_name": "Unique Purchases",
    "description": "The number of product sets purchased. For example, if users purchase 2 frisbees and 5 tennis balls from the site, this will be 2."
  },
  "ga:revenuePerItem": {
    "display_name": "Average Price",
    "description": "The average revenue per item."
  },
  "ga:itemRevenue": {
    "display_name": "Product Revenue",
    "description": "The total revenue from purchased product items."
  },
  "ga:itemsPerPurchase": {
    "display_name": "Average QTY",
    "description": "The average quantity of this item (or group of items) sold per purchase."
  },
  "ga:localTransactionRevenue": {
    "display_name": "Local Revenue",
    "description": "Transaction revenue in local currency."
  },
  "ga:localTransactionShipping": {
    "display_name": "Local Shipping",
    "description": "Transaction shipping cost in local currency."
  },
  "ga:localTransactionTax": {
    "display_name": "Local Tax",
    "description": "Transaction tax in local currency."
  },
  "ga:localItemRevenue": {
    "display_name": "Local Product Revenue",
    "description": "Product revenue in local currency."
  },
  "ga:socialInteractionNetwork": {
    "display_name": "Social Network",
    "description": "For social interactions, this represents the social network being tracked."
  },
  "ga:socialInteractionAction": {
    "display_name": "Social Action",
    "description": "For social interactions, this is the social action (e.g., +1, bookmark) being tracked."
  },
  "ga:socialInteractionNetworkAction": {
    "display_name": "Social Network and Action",
    "description": "For social interactions, this is the concatenation of the socialInteractionNetwork and socialInteractionAction action (e.g., Google: +1) being tracked at this hit level."
  },
  "ga:socialInteractionTarget": {
    "display_name": "Social Entity",
    "description": "For social interactions, this is the URL (or resource) which receives the social network action."
  },
  "ga:socialEngagementType": {
    "display_name": "Social Type",
    "description": "Engagement type, either \"Socially Engaged\" or \"Not Socially Engaged\"."
  },
  "ga:socialInteractions": {
    "display_name": "Social Actions",
    "description": "The total number of social interactions."
  },
  "ga:uniqueSocialInteractions": {
    "display_name": "Unique Social Actions",
    "description": "The number of sessions during which the specified social action(s) occurred at least once. This is based on the the unique combination of socialInteractionNetwork, socialInteractionAction, and socialInteractionTarget."
  },
  "ga:socialInteractionsPerSession": {
    "display_name": "Actions Per Social Session",
    "description": "The number of social interactions per session."
  },
  "ga:socialInteractionsPerVisit": {
    "display_name": "Actions Per Social Session",
    "description": "The number of social interactions per session."
  },
  "ga:userTimingCategory": {
    "display_name": "Timing Category",
    "description": "For easier reporting purposes, this is used to categorize all user timing variables into logical groups."
  },
  "ga:userTimingLabel": {
    "display_name": "Timing Label",
    "description": "The name of the resource's action being tracked."
  },
  "ga:userTimingVariable": {
    "display_name": "Timing Variable",
    "description": "Used to add flexibility to visualize user timings in the reports."
  },
  "ga:userTimingValue": {
    "display_name": "User Timing (ms)",
    "description": "Total number of milliseconds for user timing."
  },
  "ga:userTimingSample": {
    "display_name": "User Timing Sample",
    "description": "The number of hits sent for a particular userTimingCategory, userTimingLabel, or userTimingVariable."
  },
  "ga:avgUserTimingValue": {
    "display_name": "Avg. User Timing (sec)",
    "description": "The average elapsed time."
  },
  "ga:exceptionDescription": {
    "display_name": "Exception Description",
    "description": "The description for the exception."
  },
  "ga:exceptions": {
    "display_name": "Exceptions",
    "description": "The number of exceptions sent to Google Analytics."
  },
  "ga:exceptionsPerScreenview": {
    "display_name": "Exceptions / Screen",
    "description": "The number of exceptions thrown divided by the number of screenviews."
  },
  "ga:fatalExceptions": {
    "display_name": "Crashes",
    "description": "The number of exceptions where isFatal is set to true."
  },
  "ga:fatalExceptionsPerScreenview": {
    "display_name": "Crashes / Screen",
    "description": "The number of fatal exceptions thrown divided by the number of screenviews."
  },
  "ga:experimentId": {
    "display_name": "Experiment ID",
    "description": "The user-scoped ID of the content experiment that users were exposed to when the metrics were reported."
  },
  "ga:experimentVariant": {
    "display_name": "Variant",
    "description": "The user-scoped ID of the particular variant that users were exposed to during a content experiment."
  },
  "ga:dimensionXX": {
    "display_name": "Custom Dimension XX",
    "description": "The value of the requested custom dimension, where XX refers to the number or index of the custom dimension."
  },
  "ga:customVarNameXX": {
    "display_name": "Custom Variable (Key XX)",
    "description": "The name for the requested custom variable."
  },
  "ga:metricXX": {
    "display_name": "Custom Metric XX Value",
    "description": "The value of the requested custom metric, where XX refers to the number or index of the custom metric. Note that the data type of ga:metricXX can be INTEGER, CURRENCY, or TIME."
  },
  "ga:customVarValueXX": {
    "display_name": "Custom Variable (Value XX)",
    "description": "The value for the requested custom variable."
  },
  "ga:date": {
    "display_name": "Date",
    "description": "The date of the session formatted as YYYYMMDD."
  },
  "ga:year": {
    "display_name": "Year",
    "description": "The year of the session, a four-digit year from 2005 to the current year."
  },
  "ga:month": {
    "display_name": "Month of the year",
    "description": "Month of the session, a two digit integer from 01 to 12."
  },
  "ga:week": {
    "display_name": "Week of the Year",
    "description": "The week of the session, a two-digit number from 01 to 53. Each week starts on Sunday."
  },
  "ga:day": {
    "display_name": "Day of the month",
    "description": "The day of the month, a two-digit number from 01 to 31."
  },
  "ga:hour": {
    "display_name": "Hour",
    "description": "A two-digit hour of the day ranging from 00-23 in the timezone configured for the account. This value is also corrected for daylight savings time. If the timezone follows daylight savings time, there will be an apparent bump in the number of sessions during the changeover hour (e.g., between 1:00 and 2:00) for the day per year when that hour repeats. A corresponding hour with zero sessions will occur at the opposite changeover. (Google Analytics does not track user time more precisely than hours.)"
  },
  "ga:minute": {
    "display_name": "Minute",
    "description": "Returns the minutes, between 00 and 59, in the hour."
  },
  "ga:nthMonth": {
    "display_name": "Month Index",
    "description": "The index for a month in the specified date range. In the date range, the index for the first month is 0, for the second month 1, and so on."
  },
  "ga:nthWeek": {
    "display_name": "Week Index",
    "description": "The index for each week in the specified date range. The index for the first week in the date range is 0, for the second week 1, and so on. The index corresponds to week entries."
  },
  "ga:nthDay": {
    "display_name": "Day Index",
    "description": "The index for each day in the specified date range. The index for the first day (i.e., start-date) in the date range is 0, for the second day 1, and so on."
  },
  "ga:nthMinute": {
    "display_name": "Minute Index",
    "description": "The index for each minute in the specified date range. The index for the first minute of the first day (i.e., start-date) in the date range is 0, for the next minute 1, and so on."
  },
  "ga:dayOfWeek": {
    "display_name": "Day of Week",
    "description": "Day of the week, a one-digit number from 0 (Sunday) to 6 (Saturday)."
  },
  "ga:dayOfWeekName": {
    "display_name": "Day of Week Name",
    "description": "Name (in English) of the day of the week."
  },
  "ga:dateHour": {
    "display_name": "Hour of Day",
    "description": "Combined values of ga:date and ga:hour."
  },
  "ga:yearMonth": {
    "display_name": "Month of Year",
    "description": "Combined values of ga:year and ga:month."
  },
  "ga:yearWeek": {
    "display_name": "Week of Year",
    "description": "Combined values of ga:year and ga:week."
  },
  "ga:isoWeek": {
    "display_name": "ISO Week of the Year",
    "description": "ISO week number, where each week starts on Monday. For details, see http://en.wikipedia.org/wiki/ISO_week_date. ga:isoWeek should only be used with ga:isoYear because ga:year represents Gregorian calendar."
  },
  "ga:isoYear": {
    "display_name": "ISO Year",
    "description": "The ISO year of the session. For details, see http://en.wikipedia.org/wiki/ISO_week_date. ga:isoYear should only be used with ga:isoWeek because ga:week represents Gregorian calendar."
  },
  "ga:isoYearIsoWeek": {
    "display_name": "ISO Week of ISO Year",
    "description": "Combined values of ga:isoYear and ga:isoWeek."
  },
  "ga:dcmClickAd": {
    "display_name": "DFA Ad (GA Model)",
    "description": "DCM ad name of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickAdId": {
    "display_name": "DFA Ad ID (GA Model)",
    "description": "DCM ad ID of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickAdType": {
    "display_name": "DFA Ad Type (GA Model)",
    "description": "DCM ad type name of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickAdTypeId": {
    "display_name": "DFA Ad Type ID",
    "description": "DCM ad type ID of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickAdvertiser": {
    "display_name": "DFA Advertiser (GA Model)",
    "description": "DCM advertiser name of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickAdvertiserId": {
    "display_name": "DFA Advertiser ID (GA Model)",
    "description": "DCM advertiser ID of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickCampaign": {
    "display_name": "DFA Campaign (GA Model)",
    "description": "DCM campaign name of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickCampaignId": {
    "display_name": "DFA Campaign ID (GA Model)",
    "description": "DCM campaign ID of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickCreativeId": {
    "display_name": "DFA Creative ID (GA Model)",
    "description": "DCM creative ID of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickCreative": {
    "display_name": "DFA Creative (GA Model)",
    "description": "DCM creative name of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickRenderingId": {
    "display_name": "DFA Rendering ID (GA Model)",
    "description": "DCM rendering ID of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickCreativeType": {
    "display_name": "DFA Creative Type (GA Model)",
    "description": "DCM creative type name of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickCreativeTypeId": {
    "display_name": "DFA Creative Type ID (GA Model)",
    "description": "DCM creative type ID of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickCreativeVersion": {
    "display_name": "DFA Creative Version (GA Model)",
    "description": "DCM creative version of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickSite": {
    "display_name": "DFA Site (GA Model)",
    "description": "Site name where the DCM creative was shown and clicked on for the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickSiteId": {
    "display_name": "DFA Site ID (GA Model)",
    "description": "DCM site ID where the DCM creative was shown and clicked on for the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickSitePlacement": {
    "display_name": "DFA Placement (GA Model)",
    "description": "DCM site placement name of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickSitePlacementId": {
    "display_name": "DFA Placement ID (GA Model)",
    "description": "DCM site placement ID of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmClickSpotId": {
    "display_name": "DFA Floodlight Configuration ID (GA Model)",
    "description": "DCM Floodlight configuration ID of the DCM click matching the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmFloodlightActivity": {
    "display_name": "DFA Activity",
    "description": "DCM Floodlight activity name associated with the floodlight conversion (Analytics 360 only)."
  },
  "ga:dcmFloodlightActivityAndGroup": {
    "display_name": "DFA Activity and Group",
    "description": "DCM Floodlight activity name and group name associated with the floodlight conversion (Analytics 360 only)."
  },
  "ga:dcmFloodlightActivityGroup": {
    "display_name": "DFA Activity Group",
    "description": "DCM Floodlight activity group name associated with the floodlight conversion (Analytics 360 only)."
  },
  "ga:dcmFloodlightActivityGroupId": {
    "display_name": "DFA Activity Group ID",
    "description": "DCM Floodlight activity group ID associated with the floodlight conversion (Analytics 360 only)."
  },
  "ga:dcmFloodlightActivityId": {
    "display_name": "DFA Activity ID",
    "description": "DCM Floodlight activity ID associated with the floodlight conversion (Analytics 360 only)."
  },
  "ga:dcmFloodlightAdvertiserId": {
    "display_name": "DFA Advertiser ID",
    "description": "DCM Floodlight advertiser ID associated with the floodlight conversion (Analytics 360 only)."
  },
  "ga:dcmFloodlightSpotId": {
    "display_name": "DFA Floodlight Configuration ID",
    "description": "DCM Floodlight configuration ID associated with the floodlight conversion (Analytics 360 only)."
  },
  "ga:dcmLastEventAd": {
    "display_name": "DFA Ad",
    "description": "DCM ad name of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventAdId": {
    "display_name": "DFA Ad ID (DFA Model)",
    "description": "DCM ad ID of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventAdType": {
    "display_name": "DFA Ad Type (DFA Model)",
    "description": "DCM ad type name of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventAdTypeId": {
    "display_name": "DFA Ad Type ID (DFA Model)",
    "description": "DCM ad type ID of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventAdvertiser": {
    "display_name": "DFA Advertiser (DFA Model)",
    "description": "DCM advertiser name of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventAdvertiserId": {
    "display_name": "DFA Advertiser ID (DFA Model)",
    "description": "DCM advertiser ID of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventAttributionType": {
    "display_name": "DFA Attribution Type (DFA Model)",
    "description": "There are two possible values: ClickThrough and ViewThrough. If the last DCM event associated with the Google Analytics session was a click, then the value will be ClickThrough. If the last DCM event associated with the Google Analytics session was an ad impression, then the value will be ViewThrough (Analytics 360 only)."
  },
  "ga:dcmLastEventCampaign": {
    "display_name": "DFA Campaign (DFA Model)",
    "description": "DCM campaign name of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventCampaignId": {
    "display_name": "DFA Campaign ID (DFA Model)",
    "description": "DCM campaign ID of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventCreativeId": {
    "display_name": "DFA Creative ID (DFA Model)",
    "description": "DCM creative ID of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventCreative": {
    "display_name": "DFA Creative (DFA Model)",
    "description": "DCM creative name of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventRenderingId": {
    "display_name": "DFA Rendering ID (DFA Model)",
    "description": "DCM rendering ID of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventCreativeType": {
    "display_name": "DFA Creative Type (DFA Model)",
    "description": "DCM creative type name of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventCreativeTypeId": {
    "display_name": "DFA Creative Type ID (DFA Model)",
    "description": "DCM creative type ID of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventCreativeVersion": {
    "display_name": "DFA Creative Version (DFA Model)",
    "description": "DCM creative version of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventSite": {
    "display_name": "DFA Site (DFA Model)",
    "description": "Site name where the DCM creative was shown and clicked on for the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventSiteId": {
    "display_name": "DFA Site ID (DFA Model)",
    "description": "DCM site ID where the DCM creative was shown and clicked on for the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventSitePlacement": {
    "display_name": "DFA Placement (DFA Model)",
    "description": "DCM site placement name of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventSitePlacementId": {
    "display_name": "DFA Placement ID (DFA Model)",
    "description": "DCM site placement ID of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmLastEventSpotId": {
    "display_name": "DFA Floodlight Configuration ID (DFA Model)",
    "description": "DCM Floodlight configuration ID of the last DCM event (impression or click within the DCM lookback window) associated with the Google Analytics session (Analytics 360 only)."
  },
  "ga:dcmFloodlightQuantity": {
    "display_name": "DFA Conversions",
    "description": "The number of DCM Floodlight conversions (Analytics 360 only)."
  },
  "ga:dcmFloodlightRevenue": {
    "display_name": "DFA Revenue",
    "description": "DCM Floodlight revenue (Analytics 360 only)."
  },
  "ga:landingContentGroupXX": {
    "display_name": "Landing Page Group XX",
    "description": "Content group of users' landing pages."
  },
  "ga:previousContentGroupXX": {
    "display_name": "Previous Page Group XX",
    "description": "Refers to content group that was visited before another content group."
  },
  "ga:contentGroupXX": {
    "display_name": "Page Group XX",
    "description": "The content group on a property. A content group is a collection of content providing a logical structure that can be determined by tracking code or page title/URL regex match, or predefined rules."
  },
  "ga:nextContentGroupXX": {
    "display_name": "Next Page Group XX",
    "description": "This dimension is deprecated and will be removed soon. Please use ga:contentGroupXX instead."
  },
  "ga:userAgeBracket": {
    "display_name": "Age",
    "description": "Age bracket of users."
  },
  "ga:visitorAgeBracket": {
    "display_name": "Age",
    "description": "Age bracket of users."
  },
  "ga:userGender": {
    "display_name": "Gender",
    "description": "Gender of users."
  },
  "ga:visitorGender": {
    "display_name": "Gender",
    "description": "Gender of users."
  },
  "ga:interestOtherCategory": {
    "display_name": "Other Category",
    "description": "Indicates that users are more likely to be interested in learning about the specified category, and more likely to be ready to purchase."
  },
  "ga:interestAffinityCategory": {
    "display_name": "Affinity Category (reach)",
    "description": "Indicates that users are more likely to be interested in learning about the specified category."
  },
  "ga:interestInMarketCategory": {
    "display_name": "In-Market Segment",
    "description": "Indicates that users are more likely to be ready to purchase products or services in the specified category."
  },
  "ga:adsenseRevenue": {
    "display_name": "AdSense Revenue",
    "description": "The total revenue from AdSense ads."
  },
  "ga:adsenseAdUnitsViewed": {
    "display_name": "AdSense Ad Units Viewed",
    "description": "The number of AdSense ad units viewed. An ad unit is a set of ads displayed as a result of one piece of the AdSense ad code. For details, see https://support.google.com/adsense/answer/32715?hl=en."
  },
  "ga:adsenseAdsViewed": {
    "display_name": "AdSense Impressions",
    "description": "The number of AdSense ads viewed. Multiple ads can be displayed within an ad Unit."
  },
  "ga:adsenseAdsClicks": {
    "display_name": "AdSense Ads Clicked",
    "description": "The number of times AdSense ads on the site were clicked."
  },
  "ga:adsensePageImpressions": {
    "display_name": "AdSense Page Impressions",
    "description": "The number of pageviews during which an AdSense ad was displayed. A page impression can have multiple ad Units."
  },
  "ga:adsenseCTR": {
    "display_name": "AdSense CTR",
    "description": "The percentage of page impressions resulted in a click on an AdSense ad."
  },
  "ga:adsenseECPM": {
    "display_name": "AdSense eCPM",
    "description": "The estimated cost per thousand page impressions. It is the AdSense Revenue per 1,000 page impressions."
  },
  "ga:adsenseExits": {
    "display_name": "AdSense Exits",
    "description": "The number of sessions ended due to a user clicking on an AdSense ad."
  },
  "ga:adsenseViewableImpressionPercent": {
    "display_name": "AdSense Viewable Impression %",
    "description": "The percentage of viewable impressions."
  },
  "ga:adsenseCoverage": {
    "display_name": "AdSense Coverage",
    "description": "The percentage of ad requests that returned at least one ad."
  },
  "ga:adxImpressions": {
    "display_name": "AdX Impressions",
    "description": "An Ad Exchange ad impression is reported whenever an individual ad is displayed on the website. For example, if a page with two ad units is viewed once, we'll display two impressions."
  },
  "ga:adxCoverage": {
    "display_name": "AdX Coverage",
    "description": "Coverage is the percentage of ad requests that returned at least one ad. Generally, coverage can help identify sites where the Ad Exchange account isn't able to provide targeted ads. (Ad Impressions / Total Ad Requests) * 100"
  },
  "ga:adxMonetizedPageviews": {
    "display_name": "AdX Monetized Pageviews",
    "description": "This measures the total number of pageviews on the property that were shown with an ad from the linked Ad Exchange account. Note that a single page can have multiple ad units."
  },
  "ga:adxImpressionsPerSession": {
    "display_name": "AdX Impressions / Session",
    "description": "The ratio of Ad Exchange ad impressions to Analytics sessions (Ad Impressions / Analytics Sessions)."
  },
  "ga:adxViewableImpressionsPercent": {
    "display_name": "AdX Viewable Impressions %",
    "description": "The percentage of viewable ad impressions. An impression is considered a viewable impression when it has appeared within users' browsers and has the opportunity to be seen."
  },
  "ga:adxClicks": {
    "display_name": "AdX Clicks",
    "description": "The number of times AdX ads were clicked on the site."
  },
  "ga:adxCTR": {
    "display_name": "AdX CTR",
    "description": "The percentage of pageviews that resulted in a click on an Ad Exchange ad."
  },
  "ga:adxRevenue": {
    "display_name": "AdX Revenue",
    "description": "The total estimated revenue from Ad Exchange ads."
  },
  "ga:adxRevenuePer1000Sessions": {
    "display_name": "AdX Revenue / 1000 Sessions",
    "description": "The total estimated revenue from Ad Exchange ads per 1,000 Analytics sessions. Note that this metric is based on sessions to the site, not on ad impressions."
  },
  "ga:adxECPM": {
    "display_name": "AdX eCPM",
    "description": "The effective cost per thousand pageviews. It is the Ad Exchange revenue per 1,000 pageviews."
  },
  "ga:dfpImpressions": {
    "display_name": "DFP Impressions",
    "description": "A DFP ad impression is reported whenever an individual ad is displayed on the website. For example, if a page with two ad units is viewed once, we'll display two impressions (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:dfpCoverage": {
    "display_name": "DFP Coverage",
    "description": "Coverage is the percentage of ad requests that returned at least one ad. Generally, coverage can help identify sites where the DFP account isn't able to provide targeted ads. (Ad Impressions / Total Ad Requests) * 100 (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:dfpMonetizedPageviews": {
    "display_name": "DFP Monetized Pageviews",
    "description": "This measures the total number of pageviews on the property that were shown with an ad from the linked DFP account. Note that a single page can have multiple ad units (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:dfpImpressionsPerSession": {
    "display_name": "DFP Impressions / Session",
    "description": "The ratio of DFP ad impressions to Analytics sessions (Ad Impressions / Analytics Sessions) (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:dfpViewableImpressionsPercent": {
    "display_name": "DFP Viewable Impressions %",
    "description": "The percentage of viewable ad impressions. An impression is considered a viewable impression when it has appeared within users' browsers and has the opportunity to be seen (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:dfpClicks": {
    "display_name": "DFP Clicks",
    "description": "The number of times DFP ads were clicked on the site (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:dfpCTR": {
    "display_name": "DFP CTR",
    "description": "The percentage of pageviews that resulted in a click on an DFP ad (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:dfpRevenue": {
    "display_name": "DFP Revenue",
    "description": "DFP revenue is an estimate of the total ad revenue based on served impressions (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:dfpRevenuePer1000Sessions": {
    "display_name": "DFP Revenue / 1000 Sessions",
    "description": "The total estimated revenue from DFP ads per 1,000 Analytics sessions. Note that this metric is based on sessions to the site, not on ad impressions (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:dfpECPM": {
    "display_name": "DFP eCPM",
    "description": "The effective cost per thousand pageviews. It is the DFP revenue per 1,000 pageviews (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:backfillImpressions": {
    "display_name": "DFP Backfill Impressions",
    "description": "Backfill Impressions is the sum of all AdSense or Ad Exchance ad impressions served as backfill through DFP. An ad impression is reported whenever an individual ad is displayed on the website. For example, if a page with two ad units is viewed once, we'll display two impressions (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:backfillCoverage": {
    "display_name": "DFP Backfill Coverage",
    "description": "Backfill Coverage is the percentage of backfill ad requests that returned at least one ad. Generally, coverage can help identify sites where the publisher account isn't able to provide targeted ads. (Ad Impressions / Total Ad Requests) * 100. If both AdSense and Ad Exchange are providing backfill ads, this metric is the weighted average of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:backfillMonetizedPageviews": {
    "display_name": "DFP Backfill Monetized Pageviews",
    "description": "This measures the total number of pageviews on the property that were shown with at least one ad from the linked backfill account(s). Note that a single monetized pageview can include multiple ad impressions (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:backfillImpressionsPerSession": {
    "display_name": "DFP Backfill Impressions / Session",
    "description": "The ratio of backfill ad impressions to Analytics sessions (Ad Impressions / Analytics Sessions). If both AdSense and Ad Exchange are providing backfill ads, this metric is the sum of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:backfillViewableImpressionsPercent": {
    "display_name": "DFP Backfill Viewable Impressions %",
    "description": "The percentage of backfill ad impressions that were viewable. An impression is considered a viewable impression when it has appeared within the users' browsers and had the opportunity to be seen. If AdSense and Ad Exchange are both providing backfill ads, this metric is the weighted average of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:backfillClicks": {
    "display_name": "DFP Backfill Clicks",
    "description": "The number of times backfill ads were clicked on the site. If AdSense and Ad Exchange are both providing backfill ads, this metric is the sum of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:backfillCTR": {
    "display_name": "DFP Backfill CTR",
    "description": "The percentage of backfill impressions that resulted in a click on an ad. If AdSense and Ad Exchange are both providing backfill ads, this metric is the weighted average of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:backfillRevenue": {
    "display_name": "DFP Backfill Revenue",
    "description": "The total estimated revenue from backfill ads. If AdSense and Ad Exchange are both providing backfill ads, this metric is the sum of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:backfillRevenuePer1000Sessions": {
    "display_name": "DFP Backfill Revenue / 1000 Sessions",
    "description": "The total estimated revenue from backfill ads per 1,000 Analytics sessions. Note that this metric is based on sessions to the site and not ad impressions. If both AdSense and Ad Exchange are providing backfill ads, this metric is the sum of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:backfillECPM": {
    "display_name": "DFP Backfill eCPM",
    "description": "The effective cost per thousand pageviews. It is the DFP Backfill Revenue per 1,000 pageviews. If both AdSense and Ad Exchange are providing backfill ads, this metric is the sum of the two backfill accounts (DFP linking enabled and Hide DFP Revenue not enabled)."
  },
  "ga:acquisitionCampaign": {
    "display_name": "Acquisition Campaign",
    "description": "The campaign through which users were acquired, derived from users' first session."
  },
  "ga:acquisitionMedium": {
    "display_name": "Acquisition Medium",
    "description": "The medium through which users were acquired, derived from users' first session."
  },
  "ga:acquisitionSource": {
    "display_name": "Acquisition Source",
    "description": "The source through which users were acquired, derived from users' first session."
  },
  "ga:acquisitionSourceMedium": {
    "display_name": "Acquisition Source / Medium",
    "description": "The combined value of ga:userAcquisitionSource and ga:acquisitionMedium."
  },
  "ga:acquisitionTrafficChannel": {
    "display_name": "Acquisition Channel",
    "description": "Traffic channel through which users were acquired. It is extracted from users' first session. Traffic channel is computed based on the default channel grouping rules (at view level if available) at the time of user acquisition."
  },
  "ga:browserSize": {
    "display_name": "Browser Size",
    "description": "The viewport size of users' browsers. A session-scoped dimension, browser size captures the initial dimensions of the viewport in pixels and is formatted as width x height, for example, 1920x960."
  },
  "ga:campaignCode": {
    "display_name": "Campaign Code",
    "description": "For manual campaign tracking, it is the value of the utm_id campaign tracking parameter."
  },
  "ga:channelGrouping": {
    "display_name": "Default Channel Grouping",
    "description": "The default channel grouping shared within the View (Profile)."
  },
  "ga:checkoutOptions": {
    "display_name": "Checkout Options",
    "description": "User options specified during the checkout process, e.g., FedEx, DHL, UPS for delivery options; Visa, MasterCard, AmEx for payment options. This dimension should be used with ga:shoppingStage (Enhanced Ecommerce)."
  },
  "ga:cityId": {
    "display_name": "City ID",
    "description": "Users' city ID, derived from their IP addresses or Geographical IDs. The city IDs are the same as the Criteria IDs found at https://developers.google.com/analytics/devguides/collection/protocol/v1/geoid."
  },
  "ga:cohort": {
    "display_name": "Cohort",
    "description": "Name of the cohort to which a user belongs. Depending on how cohorts are defined, a user can belong to multiple cohorts, similar to how a user can belong to multiple segments."
  },
  "ga:cohortNthDay": {
    "display_name": "Day",
    "description": "Day offset relative to the cohort definition date. For example, if a cohort is defined with the first visit date as 2015-09-01, then for the date 2015-09-04, ga:cohortNthDay will be 3."
  },
  "ga:cohortNthMonth": {
    "display_name": "Month",
    "description": "Month offset relative to the cohort definition date. The semantics of this dimension differs based on whether lifetime value is requested or not. For a cohorts report not requesting lifetime value: This is the week offset from the cohort definition start date. For example, if cohort is defined as 2015-09-01 <= first session date <= 2015-09-30. Then, for 2015-09-01 <= date <= 2015-09-30, ga:cohortNthMonth = 0. 2015-10-01 <= date <= 2015-10-31, ga:cohortNthMonth = 2. and so on. For a cohorts request requesting lifetime value: ga:cohortNthMonth is calculated relative to the users acquisition date. It is not dependent on the cohort definition date. For example, if we define a cohort as 2015-10-01 <= first session date <= 2015-09-30. And a user was acquired on 2015-09-04. Then, for 2015-09-04 <= date <= 2015-10-04, ga:cohortNthMonth = 0 2015-10-04 <= date <= 2015-11-04, ga:cohortNthMonth = 1, and so on."
  },
  "ga:cohortNthWeek": {
    "display_name": "Week",
    "description": "Week offset relative to the cohort definition date. The semantics of this dimension differs based on whether lifetime value is requested or not. For a cohorts report not requesting lifetime value: This is the week offset from the cohort definition start date. For example, if cohort is defined as 2015-09-01 <= first session date <= 2015-09-07. Then, for 2015-09-01 <= date <= 2015-09-07, ga:cohortNthWeek = 0. 2015-09-08 <= date <= 2015-09-14, ga:cohortNthWeek = 1. etc. For a cohorts request requesting lifetime value: ga:cohortNthWeek is calculated relative to the users acquisition date. It is not dependent on the cohort definition date. For example, if we define a cohort as 2015-09-01 <= first session date <= 2015-09-07. And a user was acquired on 2015-09-04. Then, for 2015-09-04 <= date<= 2015-09-10, ga:cohortNthWeek = 0 2015-09-11 <= date <= 2015-09-17, ga:cohortNthWeek = 1"
  },
  "ga:continentId": {
    "display_name": "Continent ID",
    "description": "Users' continent ID, derived from users' IP addresses or Geographical IDs."
  },
  "ga:correlationModelId": {
    "display_name": "Correlation Model ID",
    "description": "Correlation Model ID for related products."
  },
  "ga:countryIsoCode": {
    "display_name": "Country ISO Code",
    "description": "Users' country's ISO code (in ISO-3166-1 alpha-2 format), derived from their IP addresses or Geographical IDs. For example, BR for Brazil, CA for Canada."
  },
  "ga:dataSource": {
    "display_name": "Data Source",
    "description": "The data source of a hit. By default, hits sent from analytics.js are reported as \"web\" and hits sent from the mobile SDKs are reported as \"app\". These values can be overridden in the Measurement Protocol."
  },
  "ga:dbmClickAdvertiser": {
    "display_name": "DBM Advertiser (GA Model)",
    "description": "DBM advertiser name of the DBM click matching the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmClickAdvertiserId": {
    "display_name": "DBM Advertiser ID (GA Model)",
    "description": "DBM advertiser ID of the DBM click matching the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmClickCreativeId": {
    "display_name": "DBM Creative ID (GA Model)",
    "description": "DBM creative ID of the DBM click matching the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmClickExchange": {
    "display_name": "DBM Exchange (GA Model)",
    "description": "DBM exchange name of the DBM click matching the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmClickExchangeId": {
    "display_name": "DBM Exchange ID (GA Model)",
    "description": "DBM exchange ID of the DBM click matching the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmClickInsertionOrder": {
    "display_name": "DBM Insertion Order (GA Model)",
    "description": "DBM insertion order name of the DBM click matching the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmClickInsertionOrderId": {
    "display_name": "DBM Insertion Order ID (GA Model)",
    "description": "DBM insertion order ID of the DBM click matching the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmClickLineItem": {
    "display_name": "DBM Line Item NAME (GA Model)",
    "description": "DBM line item name of the DBM click matching the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmClickLineItemId": {
    "display_name": "DBM Line Item ID (GA Model)",
    "description": "DBM line item ID of the DBM click matching the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmClickSite": {
    "display_name": "DBM Site (GA Model)",
    "description": "DBM site name where the DBM creative was shown and clicked on for the DBM click matching the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmClickSiteId": {
    "display_name": "DBM Site ID (GA Model)",
    "description": "DBM site ID where the DBM creative was shown and clicked on for the DBM click matching the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmLastEventAdvertiser": {
    "display_name": "DBM Advertiser (DFA Model)",
    "description": "DBM advertiser name of the last DBM event (impression or click within the DBM lookback window) associated with the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmLastEventAdvertiserId": {
    "display_name": "DBM Advertiser ID (DFA Model)",
    "description": "DBM advertiser ID of the last DBM event (impression or click within the DBM lookback window) associated with the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmLastEventCreativeId": {
    "display_name": "DBM Creative ID (DFA Model)",
    "description": "DBM creative ID of the last DBM event (impression or click within the DBM lookback window) associated with the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmLastEventExchange": {
    "display_name": "DBM Exchange (DFA Model)",
    "description": "DBM exchange name of the last DBM event (impression or click within the DBM lookback window) associated with the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmLastEventExchangeId": {
    "display_name": "DBM Exchange ID (DFA Model)",
    "description": "DBM exchange ID of the last DBM event (impression or click within the DBM lookback window) associated with the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmLastEventInsertionOrder": {
    "display_name": "DBM Insertion Order (DFA Model)",
    "description": "DBM insertion order name of the last DBM event (impression or click within the DBM lookback window) associated with the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmLastEventInsertionOrderId": {
    "display_name": "DBM Insertion Order ID (DFA Model)",
    "description": "DBM insertion order ID of the last DBM event (impression or click within the DBM lookback window) associated with the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmLastEventLineItem": {
    "display_name": "DBM Line Item (DFA Model)",
    "description": "DBM line item name of the last DBM event (impression or click within the DBM lookback window) associated with the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmLastEventLineItemId": {
    "display_name": "DBM Line Item ID (DFA Model)",
    "description": "DBM line item ID of the last DBM event (impression or click within the DBM lookback window) associated with the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmLastEventSite": {
    "display_name": "DBM Site (DFA Model)",
    "description": "DBM site name where the DBM creative was shown and clicked on for the last DBM event (impression or click within the DBM lookback window) associated with the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmLastEventSiteId": {
    "display_name": "DBM Site ID (DFA Model)",
    "description": "DBM site ID where the DBM creative was shown and clicked on for the last DBM event (impression or click within the DBM lookback window) associated with the Google Analytics session (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dsAdGroup": {
    "display_name": "DS Ad Group",
    "description": "DS Ad Group (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsAdGroupId": {
    "display_name": "DS Ad Group ID",
    "description": "DS Ad Group ID (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsAdvertiser": {
    "display_name": "DS Advertiser",
    "description": "DS Advertiser (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsAdvertiserId": {
    "display_name": "DS Advertiser ID",
    "description": "DS Advertiser ID (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsAgency": {
    "display_name": "DS Agency",
    "description": "DS Agency (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsAgencyId": {
    "display_name": "DS Agency ID",
    "description": "DS Agency ID (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsCampaign": {
    "display_name": "DS Campaign",
    "description": "DS Campaign (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsCampaignId": {
    "display_name": "DS Campaign ID",
    "description": "DS Campaign ID (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsEngineAccount": {
    "display_name": "DS Engine Account",
    "description": "DS Engine Account (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsEngineAccountId": {
    "display_name": "DS Engine Account ID",
    "description": "DS Engine Account ID (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsKeyword": {
    "display_name": "DS Keyword",
    "description": "DS Keyword (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsKeywordId": {
    "display_name": "DS Keyword ID",
    "description": "DS Keyword ID (Analytics 360 only, requires integration with DS)."
  },
  "ga:internalPromotionCreative": {
    "display_name": "Internal Promotion Creative",
    "description": "The creative content designed for a promotion (Enhanced Ecommerce)."
  },
  "ga:internalPromotionId": {
    "display_name": "Internal Promotion ID",
    "description": "The ID of the promotion (Enhanced Ecommerce)."
  },
  "ga:internalPromotionName": {
    "display_name": "Internal Promotion Name",
    "description": "The name of the promotion (Enhanced Ecommerce)."
  },
  "ga:internalPromotionPosition": {
    "display_name": "Internal Promotion Position",
    "description": "The position of the promotion on the web page or application screen (Enhanced Ecommerce)."
  },
  "ga:isTrueViewVideoAd": {
    "display_name": "TrueView Video Ad",
    "description": "A boolean, Yes or No, indicating whether the ad is an AdWords TrueView video ad."
  },
  "ga:metroId": {
    "display_name": "Metro Id",
    "description": "The three digit Designated Market Area (DMA) code from where traffic arrived, derived from users' IP addresses or Geographical IDs."
  },
  "ga:nthHour": {
    "display_name": "Hour Index",
    "description": "The index for each hour in the specified date range. The index for the first hour of the first day (i.e., start-date) in the date range is 0, for the next hour 1, and so on."
  },
  "ga:orderCouponCode": {
    "display_name": "Order Coupon Code",
    "description": "Code for the order-level coupon (Enhanced Ecommerce)."
  },
  "ga:productBrand": {
    "display_name": "Product Brand",
    "description": "The brand name under which the product is sold (Enhanced Ecommerce)."
  },
  "ga:productCategoryHierarchy": {
    "display_name": "Product Category (Enhanced Ecommerce)",
    "description": "The hierarchical category in which the product is classified (Enhanced Ecommerce)."
  },
  "ga:productCategoryLevelXX": {
    "display_name": "Product Category Level XX",
    "description": "Level (1-5) in the product category hierarchy, starting from the top (Enhanced Ecommerce)."
  },
  "ga:productCouponCode": {
    "display_name": "Product Coupon Code",
    "description": "Code for the product-level coupon (Enhanced Ecommerce)."
  },
  "ga:productListName": {
    "display_name": "Product List Name",
    "description": "The name of the product list in which the product appears (Enhanced Ecommerce)."
  },
  "ga:productListPosition": {
    "display_name": "Product List Position",
    "description": "The position of the product in the product list (Enhanced Ecommerce)."
  },
  "ga:productVariant": {
    "display_name": "Product Variant",
    "description": "The specific variation of a product, e.g., XS, S, M, L for size; or Red, Blue, Green, Black for color (Enhanced Ecommerce)."
  },
  "ga:queryProductId": {
    "display_name": "Queried Product ID",
    "description": "ID of the product being queried."
  },
  "ga:queryProductName": {
    "display_name": "Queried Product Name",
    "description": "Name of the product being queried."
  },
  "ga:queryProductVariation": {
    "display_name": "Queried Product Variation",
    "description": "Variation of the product being queried."
  },
  "ga:regionId": {
    "display_name": "Region ID",
    "description": "Users' region ID, derived from their IP addresses or Geographical IDs. In U.S., a region is a state, New York, for example. The region IDs are the same as the Criteria IDs listed at https://developers.google.com/analytics/devguides/collection/protocol/v1/geoid."
  },
  "ga:regionIsoCode": {
    "display_name": "Region ISO Code",
    "description": "Users' region ISO code in ISO-3166-2 format, derived from their IP addresses or Geographical IDs."
  },
  "ga:relatedProductId": {
    "display_name": "Related Product ID",
    "description": "ID of the related product."
  },
  "ga:relatedProductName": {
    "display_name": "Related Product Name",
    "description": "Name of the related product."
  },
  "ga:relatedProductVariation": {
    "display_name": "Related Product Variation",
    "description": "Variation of the related product."
  },
  "ga:shoppingStage": {
    "display_name": "Shopping Stage",
    "description": "Various stages of the shopping experience that users completed in a session, e.g., PRODUCT_VIEW, ADD_TO_CART, CHECKOUT, etc. (Enhanced Ecommerce)."
  },
  "ga:subContinentCode": {
    "display_name": "Sub Continent Code",
    "description": "Users' sub-continent code in UN M.49 format, derived from their IP addresses or Geographical IDs. For example, 061 for Polynesia, 154 for Northern Europe."
  },
  "ga:buyToDetailRate": {
    "display_name": "Buy-to-Detail Rate",
    "description": "Unique purchases divided by views of product detail pages (Enhanced Ecommerce)."
  },
  "ga:calcMetric_<NAME>": {
    "display_name": "Calculated Metric",
    "description": "The value of the requested calculated metric, where <NAME> refers to the user-defined name of the calculated metric. Note that the data type of ga:calcMetric_<NAME> can be FLOAT, INTEGER, CURRENCY, TIME, or PERCENT. For details, see https://support.google.com/analytics/answer/6121409."
  },
  "ga:cartToDetailRate": {
    "display_name": "Cart-to-Detail Rate",
    "description": "Product adds divided by views of product details (Enhanced Ecommerce)."
  },
  "ga:cohortActiveUsers": {
    "display_name": "Users",
    "description": "This metric is relevant in the context of ga:cohortNthDay/ga:cohortNthWeek/ga:cohortNthMonth. It indicates the number of users in the cohort who are active in the time window corresponding to the cohort nth day/week/month. For example, for ga:cohortNthWeek = 1, number of users (in the cohort) who are active in week 1. If a request doesn't have any of ga:cohortNthDay/ga:cohortNthWeek/ga:cohortNthMonth, this metric will have the same value as ga:cohortTotalUsers."
  },
  "ga:cohortAppviewsPerUser": {
    "display_name": "Appviews per User",
    "description": "App views per user for a cohort."
  },
  "ga:cohortAppviewsPerUserWithLifetimeCriteria": {
    "display_name": "Appviews Per User (LTV)",
    "description": "App views per user for the acquisition dimension for a cohort."
  },
  "ga:cohortGoalCompletionsPerUser": {
    "display_name": "Goal Completions per User",
    "description": "Goal completions per user for the acquisition dimension for a cohort."
  },
  "ga:cohortGoalCompletionsPerUserWithLifetimeCriteria": {
    "display_name": "Goal Completions Per User (LTV)",
    "description": "Goal completions per user for a cohort."
  },
  "ga:cohortPageviewsPerUser": {
    "display_name": "Pageviews per User",
    "description": "Pageviews per user for a cohort."
  },
  "ga:cohortPageviewsPerUserWithLifetimeCriteria": {
    "display_name": "Pageviews Per User (LTV)",
    "description": "Pageviews per user for the acquisition dimension for a cohort."
  },
  "ga:cohortRetentionRate": {
    "display_name": "User Retention",
    "description": "Cohort retention rate."
  },
  "ga:cohortRevenuePerUser": {
    "display_name": "Revenue per User",
    "description": "Revenue per user for a cohort."
  },
  "ga:cohortRevenuePerUserWithLifetimeCriteria": {
    "display_name": "Revenue Per User (LTV)",
    "description": "Revenue per user for the acquisition dimension for a cohort."
  },
  "ga:cohortSessionDurationPerUser": {
    "display_name": "Session Duration per User",
    "description": "Session duration per user for a cohort."
  },
  "ga:cohortSessionDurationPerUserWithLifetimeCriteria": {
    "display_name": "Session Duration Per User (LTV)",
    "description": "Session duration per user for the acquisition dimension for a cohort."
  },
  "ga:cohortSessionsPerUser": {
    "display_name": "Sessions per User",
    "description": "Sessions per user for a cohort."
  },
  "ga:cohortSessionsPerUserWithLifetimeCriteria": {
    "display_name": "Sessions Per User (LTV)",
    "description": "Sessions per user for the acquisition dimension for a cohort."
  },
  "ga:cohortTotalUsers": {
    "display_name": "Total Users",
    "description": "Number of users belonging to the cohort, also known as cohort size."
  },
  "ga:cohortTotalUsersWithLifetimeCriteria": {
    "display_name": "Users",
    "description": "This is relevant in the context of a request which has the dimensions ga:acquisitionTrafficChannel/ga:acquisitionSource/ga:acquisitionMedium/ga:acquisitionCampaign. It represents the number of users in the cohorts who are acquired through the current channel/source/medium/campaign. For example, for ga:acquisitionTrafficChannel=Direct, it represents the number users in the cohort, who were acquired directly. If none of these mentioned dimensions are present, then its value is equal to ga:cohortTotalUsers."
  },
  "ga:correlationScore": {
    "display_name": "Correlation Score",
    "description": "Correlation Score for related products."
  },
  "ga:dbmCPA": {
    "display_name": "DBM eCPA",
    "description": "DBM Revenue eCPA (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmCPC": {
    "display_name": "DBM eCPC",
    "description": "DBM Revenue eCPC (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmCPM": {
    "display_name": "DBM eCPM",
    "description": "DBM Revenue eCPM (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmCTR": {
    "display_name": "DBM CTR",
    "description": "DBM CTR (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmClicks": {
    "display_name": "DBM Clicks",
    "description": "DBM Total Clicks (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmConversions": {
    "display_name": "DBM Conversions",
    "description": "DBM Total Conversions (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmCost": {
    "display_name": "DBM Cost",
    "description": "DBM Cost (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmImpressions": {
    "display_name": "DBM Impressions",
    "description": "DBM Total Impressions (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dbmROAS": {
    "display_name": "DBM ROAS",
    "description": "DBM ROAS (Analytics 360 only, requires integration with DBM)."
  },
  "ga:dcmCPC": {
    "display_name": "DFA CPC",
    "description": "DCM Cost Per Click (Analytics 360 only)."
  },
  "ga:dcmCTR": {
    "display_name": "DFA CTR",
    "description": "DCM Click Through Rate (Analytics 360 only)."
  },
  "ga:dcmClicks": {
    "display_name": "DFA Clicks",
    "description": "DCM Total Clicks (Analytics 360 only)."
  },
  "ga:dcmCost": {
    "display_name": "DFA Cost",
    "description": "DCM Total Cost (Analytics 360 only)."
  },
  "ga:dcmImpressions": {
    "display_name": "DFA Impressions",
    "description": "DCM Total Impressions (Analytics 360 only)."
  },
  "ga:dcmMargin": {
    "display_name": "DFA Margin",
    "description": "This metric is deprecated and will be removed soon. Please use ga:dcmROAS instead."
  },
  "ga:dcmROAS": {
    "display_name": "DFA ROAS",
    "description": "DCM Return On Ad Spend (ROAS) (Analytics 360 only)."
  },
  "ga:dcmROI": {
    "display_name": "DFA ROI",
    "description": "This metric is deprecated and will be removed soon. Please use ga:dcmROAS instead."
  },
  "ga:dcmRPC": {
    "display_name": "DFA RPC",
    "description": "DCM Revenue Per Click (Analytics 360 only)."
  },
  "ga:dsCPC": {
    "display_name": "DS CPC",
    "description": "DS Cost to advertiser per click (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsCTR": {
    "display_name": "DS CTR",
    "description": "DS Click Through Rate (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsClicks": {
    "display_name": "DS Clicks",
    "description": "DS Clicks (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsCost": {
    "display_name": "DS Cost",
    "description": "DS Cost (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsImpressions": {
    "display_name": "DS Impressions",
    "description": "DS Impressions (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsProfit": {
    "display_name": "DS Profit",
    "description": "DS Profie (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsReturnOnAdSpend": {
    "display_name": "DS ROAS",
    "description": "DS Return On Ad Spend (Analytics 360 only, requires integration with DS)."
  },
  "ga:dsRevenuePerClick": {
    "display_name": "DS RPC",
    "description": "DS Revenue Per Click (Analytics 360 only, requires integration with DS)."
  },
  "ga:hits": {
    "display_name": "Hits",
    "description": "Total number of hits for the view (profile). This metric sums all hit types, including pageview, custom event, ecommerce, and other types. Because this metric is based on the view (profile), not on the property, it is not the same as the property's hit volume."
  },
  "ga:internalPromotionCTR": {
    "display_name": "Internal Promotion CTR",
    "description": "The rate at which users clicked through to view the internal promotion (ga:internalPromotionClicks / ga:internalPromotionViews) - (Enhanced Ecommerce)."
  },
  "ga:internalPromotionClicks": {
    "display_name": "Internal Promotion Clicks",
    "description": "The number of clicks on an internal promotion (Enhanced Ecommerce)."
  },
  "ga:internalPromotionViews": {
    "display_name": "Internal Promotion Views",
    "description": "The number of views of an internal promotion (Enhanced Ecommerce)."
  },
  "ga:localProductRefundAmount": {
    "display_name": "Local Product Refund Amount",
    "description": "Refund amount in local currency for a given product (Enhanced Ecommerce)."
  },
  "ga:localRefundAmount": {
    "display_name": "Local Refund Amount",
    "description": "Total refund amount in local currency for the transaction (Enhanced Ecommerce)."
  },
  "ga:productAddsToCart": {
    "display_name": "Product Adds To Cart",
    "description": "Number of times the product was added to the shopping cart (Enhanced Ecommerce)."
  },
  "ga:productCheckouts": {
    "display_name": "Product Checkouts",
    "description": "Number of times the product was included in the check-out process (Enhanced Ecommerce)."
  },
  "ga:productDetailViews": {
    "display_name": "Product Detail Views",
    "description": "Number of times users viewed the product-detail page (Enhanced Ecommerce)."
  },
  "ga:productListCTR": {
    "display_name": "Product List CTR",
    "description": "The rate at which users clicked through on the product in a product list (ga:productListClicks / ga:productListViews) - (Enhanced Ecommerce)."
  },
  "ga:productListClicks": {
    "display_name": "Product List Clicks",
    "description": "Number of times users clicked the product when it appeared in the product list (Enhanced Ecommerce)."
  },
  "ga:productListViews": {
    "display_name": "Product List Views",
    "description": "Number of times the product appeared in a product list (Enhanced Ecommerce)."
  },
  "ga:productRefundAmount": {
    "display_name": "Product Refund Amount",
    "description": "Total refund amount associated with the product (Enhanced Ecommerce)."
  },
  "ga:productRefunds": {
    "display_name": "Product Refunds",
    "description": "Number of times a refund was issued for the product (Enhanced Ecommerce)."
  },
  "ga:productRemovesFromCart": {
    "display_name": "Product Removes From Cart",
    "description": "Number of times the product was removed from the shopping cart (Enhanced Ecommerce)."
  },
  "ga:productRevenuePerPurchase": {
    "display_name": "Product Revenue per Purchase",
    "description": "Average product revenue per purchase (commonly used with Product Coupon Code) (ga:itemRevenue / ga:uniquePurchases) - (Enhanced Ecommerce)."
  },
  "ga:quantityAddedToCart": {
    "display_name": "Quantity Added To Cart",
    "description": "Number of product units added to the shopping cart (Enhanced Ecommerce)."
  },
  "ga:quantityCheckedOut": {
    "display_name": "Quantity Checked Out",
    "description": "Number of product units included in check out (Enhanced Ecommerce)."
  },
  "ga:quantityRefunded": {
    "display_name": "Quantity Refunded",
    "description": "Number of product units refunded (Enhanced Ecommerce)."
  },
  "ga:quantityRemovedFromCart": {
    "display_name": "Quantity Removed From Cart",
    "description": "Number of product units removed from a shopping cart (Enhanced Ecommerce)."
  },
  "ga:queryProductQuantity": {
    "display_name": "Queried Product Quantity",
    "description": "Quantity of the product being queried."
  },
  "ga:refundAmount": {
    "display_name": "Refund Amount",
    "description": "Currency amount refunded for a transaction (Enhanced Ecommerce)."
  },
  "ga:relatedProductQuantity": {
    "display_name": "Related Product Quantity",
    "description": "Quantity of the related product."
  },
  "ga:revenuePerUser": {
    "display_name": "Revenue per User",
    "description": "The total sale revenue (excluding shipping and tax) of the transaction divided by the total number of users."
  },
  "ga:sessionsPerUser": {
    "display_name": "Number of Sessions per User",
    "description": "The total number of sessions divided by the total number of users."
  },
  "ga:totalRefunds": {
    "display_name": "Refunds",
    "description": "Number of refunds that have been issued (Enhanced Ecommerce)."
  },
  "ga:transactionsPerUser": {
    "display_name": "Transactions per User",
    "description": "Total number of transactions divided by total number of users."
  }
};
