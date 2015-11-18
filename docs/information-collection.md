# About the Information we collect:

Metabase uses Google Analytics to collect anonymous usage information from the installed servers that enable this feature. Below are the events we have instrumented, as well as the information we collect about the user performing the action and the instance being used. 

While this list of anonymous information we collect might seem long, it’s useful to compare this to other alternatives. With a typical SaaS platform, not only will this information be collected, but it will also be accompanied by information about your data, how often it is accessed, the specific queries that you use, specific numbers of records all tied to your company and current plan.

We collect this information to improve your experience and the quality of Metabase, and in the list below, we spell out exactly why we collect each bit of information. 

If you prefer not to provide us with this anonymous usage data, please go to your instance’s admin section and set the “collect-anonymouse-usage-metrics” value to False. 


### Example questions we want to answer:
* Is our query interface working?
    * Are users stopping halfway through a question? 
    * Are users using filters?
    * Are users using groupings?
    * How often are users using bare rows vs other aggregation options?
    * are people clicking on column headings to sort or manually adding a sort clause?
* How often are users writing SQL instead of using the query interface?
    * are these queries written by a select group of analysts or is the entire company sql literate?
* Are people using dashboards as a starting point for queries?
* how many clicks are there on dashboard cards?
* How many of these clicks result in modified queries that are executed?
* How often are questions saved?
* How often are saved questions added to dashboards?


### What we will do with the answers to these questions:
* Prioritize improvements in the query interface vs the SQL interface.
* Optimize the product for the usage patterns our users are using the product for
* Stay on top of browser incompatibilities
* Optimize our dashboards for either passive consumption or as a starting point for further exploration depending on how they are being used

While we will closely follow reported issues and feature requests, we aim to make as many of our users happy and provide them with improvements in features that matter to them. Allowing us to collect information about your instance gives your users a vote in future improvements in a direct way. 


# The data we collect:


### Events

| Category | Action | Why we collect this|
|---------|--------|--------------------|
| Card Query Builder | Card added to dashboard | To understand how often users add cards to dashboards. If we find that people mainly add cards vs keep them free standing, we will prioritize dashboards features vs ad hoc questioning. |
| Card Query Builder | filter added |  Are users actively filtering in queries or using materialized views? |
| Card Query Builder | aggregation added | Are users mainly looking at rows or segments of tables or running aggregate metrics. If the former, we intend to improve the power of our segmentation features. |
| Card Query Builder | group by added | How often do users slice and dice information by dimensions? Is this intuitive? Are users trying and failing to do this? |
| Card Query Builder | sort added | How often do users manually sort vs use the sort icon on the columns? | 
| Card Query Builder | sort icon clicked | How often do users manually sort vs use the sort icon on the columns? | 
| Card Query Builder | limit applied | How often do users manually limit the results that come back? | 
| Card Query Builder | query ran | Looking for mismatches between people adding sorts, limits, etc and actually running the query. Are there discrepencies between these numbers and the rest of the query clause events? Are there browsers or languages where these numbers are out of wack? | 
| Card Query Builder | saved | How often are users saving a question for later vs running quick Ad Hoc questions? | 
| SQL Query | started | How often do users need to revert to SQL? If this is very high, it’s an indication our query language is not expressive enough or the query builder easy enough. We watch this number to understand how to improve our query language. | 
| SQL Query | run | How often are sql queries started but not run? This is used as an alerting condition on bugs or issues with the SQL interface. | 
| SQL Query | saved | How often are people saving sql backed questions? |  
| SQL Query | Card added to dashboard | This helps us understand whether our query language is expressive enough for ad hoc queries, whether it is also expressive enough for canonical dashboards, or if it doesn’t go far enough in one or both of those cases. | 
| Dashboard | Rearrange Started | How often do users wish to rearrange their dashboards? | 
| Dashboard | Rearrange Finished | How often do users commit their changes to dashboard lay out. If this number is much less than rearrange starts, there might be a bug or UX issue. |
| Dashboard | Card Clicked | How often are dashboard cards used as a starting point for further exploration?  |



