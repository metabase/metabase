
## Getting alerts about questions
Whether you're keeping track of revenue, users, or negative reviews, there are often times when you want to be alerted about something.

### Types of alerts
There are three kinds of things you can get alerted about in Metabase:
1. When a time series cross a goal line.
2. When your progress bar reaches or goes below its goal.
3. When a questions returns a result.

We'll go through these one by one.

### Goal line alerts
This kind of alert is useful when you're doing things like tracking daily active users and you want to know when you reach a certain number of them, or when you're tracking orders per week and you want to know whenever that number ever goes below a certain threshold.

To start, you'll need a line, area, or bar chart displaying a number over time. (If you need help with that, check out the page on [asking questions](04-asking-questions).)

Now we need to set up a goal line. To do that, open up the visualization settings by clicking the gear icon next to the dropdown where you chose your chart type. Then click on the Display tab, and turn on the "Show goal" setting. Choose a value for your goal and click Done.

Save your question, then click on the menu button in the top right of the screen and click on "Get alerts about this." This is where you'll get to choose a few things:
- Whether you want to be alerted when your chart goes above, or goes below your goal line.
- Whether you only wanted to be alerted the first time this happens, or every time this happens.
- How often you want Metabase to check to see if the goal line has been crossed
