## Sharing updates with pulses

The Pulses feature in Metabase gives you the ability to automatically send regular updates to your teammates to help everyone keep track of changes to the metrics that matter to you most. You can deliver a pulse via email or [Slack](https://slack.com/), on the schedule of your choice.

To create a new pulse, click the plus (+) button in the top-right of Metabase and select `New pulse`.

### Name it

First, choose a name for your pulse. This will show up in the email subject line and the Slack message title, so choose something that will let people know what kind of updates the pulse will contain, like “Daily Marketing Update,” or “Users Metrics.” Next, choose which collection it should be saved in so that it's easy to find in the future.

![Giving it a name](images/pulses/02-name-it.png)

### Pick your data

Before you can create a pulse, you’ll need to have some [saved questions](06-sharing-answers.md). Click the dropdown to see a list of all your saved questions. You can type in the dropdown to help filter and find the question you’re looking for.

![Pick your data](images/pulses/03-pick-your-data.png)

When you select a saved question, Metabase will show you a preview of how it’ll look in the pulse. Because of the space constraints of email and Slack, Metabase will automatically make some adjustments to the appearance of your saved question so that it looks great in the pulse. For example, in order to save space, pie charts will automatically be transformed into bar charts.

![Behold! The metamorphosis.](images/pulses/04-transformation.png)

Now you can include tables in your pulses as well. They'll be capped to 10 columns and 20 rows, and for emailed pulses the rest of the results will be included automatically as a file attachment, with a limit of 2,000 rows.

![Table in pulse](images/pulses/table.png)

#### Attaching a .csv or .xls with results

You can also optionally include the results of a saved question in an emailed pulse as a .csv or .xls file attachment. Just click the paperclip icon on an included saved question to add the attachment. Click the paperclip again to remove the attachment.

![Attach button](images/pulses/attachments/attach-button.png)

Choose between a .csv or .xls file by clicking on the text buttons:

![Attached](images/pulses/attachments/attached.png)

Your attachments will be included in your emailed pulse just like a regular email attachment:

![Email attachment](images/pulses/attachments/email.png)

#### Limitations

Currently, there are a few restrictions on what kinds of saved questions you can put into a pulse:

- Raw data questions are capped to 10 columns and 20 rows. For emailed pulses, the rest of the results will be included automatically as a file attachment, with a limit of 2,000 rows.
- Pivot tables will be cropped to a maximum of three columns and 10 rows.
- Bar charts (and pie charts which get turned into bar charts) will be cropped to one column for the labels, one column for the values, and 10 total rows.

### Choose how and when to deliver your data

Each pulse you create can be delivered by email, Slack, or both. You can also set a different delivery schedule for email versus Slack. To deliver by email, just type in the Metabase user names, or email addresses you want to send the pulse to, separated by commas. Then, choose to either send it daily, weekly, or monthly, and the time at which you want it to be sent.

![Setting the email schedule](images/pulses/05-email-schedule.png)

To send via Slack, you’ll need to choose which channel you want to post the pulse in, whether you want it to post hourly or daily, and at what time. Again, the schedule for Slack can be different from the schedule for email.

Once you’re done, just click `Create pulse` and you’ll see your new pulse in the collection where you chose to save it

### Editing or archiving a pulse

If you ever need to make changes to a pulse, just navigate to the collection where it's saved and click on it, or search for it in the big search bar at the top of Metabase.

If a pulse has outlived its usefulness you can archive it by clicking on the Archive button at the bottom of the pulse's detail page. Just remember: if you archive a pulse, no one will receive it anymore. You can unarchive a pulse just like you can with questions and dashboards by navigating to the archive from the top-right button while viewing any collection and clicking on the View Archive menu option, then clicking on the `Unarchive this` button on the far right next to the pulse.

---

## Next: Connecting Metabase to Slack with Metabot 🤖

If your team uses Slack to communicate, you can [use Metabot](11-metabot.md) to display your saved questions directly within Slack whenever you want.
