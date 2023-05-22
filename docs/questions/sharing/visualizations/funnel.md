---
title: Funnel charts
---

# Funnel charts

**Funnels** are commonly used in e-commerce or sales to visualize how many customers are present within each step of a checkout flow or sales cycle. At their most general, funnels show you values broken out by steps, and the percent decrease between each successive step. To create a funnel in Metabase, you'll need to have a table with at least two columns: one column that contains the metric you're interested in, and another that contains the funnel's steps.

For example, I might have an Opportunities table, and I could create a question that gives me the number of sales leads broken out by a field that contains stages such as `Prospecting`, `Qualification`, `Proposal`, `Negotiation`, and `Closed`. In this example, the percentages shown along the x-axis tell you what percent of the total starting opportunities are still present at each subsequent step; so 18.89% of our total opportunities have made it all the way to being closed deals. The number below each percent is the actual value of the count at that step — in our example, the actual number of opportunities that are currently at each step. Together, these numbers help you figure out where you're losing your customers or users.

![Funnel](../../images/funnel.png)