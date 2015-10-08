
## Step 3: Asking Questions 

For the next few examples, we'll be using the sample dataset that comes with Metabase. If you want to follow along using your own database that you connected in step 2, everything should work similarly, though obviously with different results.

### The homepage

If you look at the Metabase homepage, you'll see the activity feed. Right now there’s not much there, but it’ll soon get full as you or your teammates do things in Metabase.

![Activity Feed](images/ActivityFeed.png)

### Asking a new question

Enough about that — let’s get to asking questions. Go ahead and click **New Question** at the top of the screen.

Now we’re on the new question page. The bar that you see going across the page is what you’ll use to ask your questions. You’ll notice that the “Select a table” dropdown is already open, showing you a list of your database(s) and the tables within them. 

![Query Builder](images/QueryBuilder.png)

In our example, we’re going to ask a question about the Orders table in the Sample Dataset database, so we’ll click on **Orders** in the dropdown. The Orders table has a bunch of fake data in it about product orders for a made up company.

![Orders](images/Orders.png)

### Our first question…

For now, let's start with a simple question: how many orders have been placed with a subtotal (before tax) greater than $40?  More precisely, this question translates to, "How many records (or rows) are in the table 'Orders' with a value greater than 40 in the Subtotal column?”

To find out, we want to *filter* the data by **the field we’re interested in**, which is **Subtotal**. Since each row in this table represents one order, counting how many rows there are after we’ve filtered them will give us the answer we want.

![Subtotal](images/Subtotal.png)

So, after we select Subtotal from the Filter dropdown we’ll get some options for the filter, and we’ll choose **Greater than**, type the number 40 in the box, and click Add Filter.

![Add Filter](images/AddFilter.png)

Next we need to tell Metabase what we want to see. Under the View dropdown, we’ll select **Count**, because, like we said, we want to count the total number of rows that match our filter. If we left the View set to Raw Data, that would just show us a list of all the rows, which doesn’t answer our question.

![Count](images/Count.png)

### …and our first answer!

Okay, cool — we’re ready to ask our question, so let’s click the **Run query** button!

So it looks like there were 12,284 orders, each with a subtotal greater than $40. Ka-ching! Another way of saying this is that there were 12,284 *records* in the table that met the parameters we set. This is how nerds would say it.

![Count Answer](images/CountAnswer.png)

### Tweaking our question

Okay, so that’s pretty useful, but it would be even *more* useful if we could know on *which days* our customers placed these big orders. That’s not hard to do at all.

Back in the question builder box, next to **Count** in the View area, we’ll click on **Add a grouping.** This shows us a dropdown of columns that we can use to group our results by. the one we want is **Created At**, because this will now give us a separate total count of orders over $40 by the days the orders were placed (or “created”). So we’ll select **Created At** and click **Run query** again.

![Created At](images/CreatedAt.png)

This time our result looks different: instead of one big number, now we’re looking at a table that shows us how many orders over $40 there were each day. Neat, but this isn’t really a great way of visualizing this information.

![Count by Day](images/CountByDay.png)

### Changing the visualization

Luckily enough, Metabase can present the answers to your questions in a variety of ways. To change the visualization, just select one of the options from the **Visualization** dropdown menu, which is in the top-left of the screen, above the table. Let’s choose **Area**.

![Visualization Dropdown Menu](images/VisualizationMenu.png)

Sweet! Looks like business is booming — up and to the right is always good. If you want, try playing around with other visualization options in from the dropdown.

![Area Chart](images/AreaChart.png)

You’ll notice that some formats aren’t the best way to show an answer to a question. If Metabase think that's the case with a specific answer and visualization, the choice will appear faded in the visualization dropdown menu. For example, it wouldn't make sense to show the total number of orders over $40 as a single bar graph, or as a map.

If you want, you can try playing around with your question, like changing the number 40 to a different number. Whenever you make any changes to the question, the blue "Run query" button will reappear. Click it to ask your new question and get your new answer.

### Next: share your answers
While Metabase can be used on your own, you can also share your answers with others in your company. Let's learn [how to share your answers](04-sharing-answers.md).