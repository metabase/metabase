
## Sharing Updates with Pulses
The Pulses feature in Metabase gives you the ability to automatically send regular updates to your teammates to help everyone keep track of changes to the metrics that matter to you most. You can deliver a pulse via email or [Slack](https://slack.com/), on the schedule of your choice.

You can create a pulse and view all of the existing pulses by clicking the `Pulses` link from the top menu. Click `Create a pulse` to get started.

![Create a pulse](images/pulses/01-empty-state.png)

### Name It
First, choose a name for your pulse. This will show up in the email subject line and the Slack message title, so choose something that will let people know what kind of updates the pulse will contain, like “Daily Marketing Update,” or “Users Metrics.”

![Giving it a name](images/pulses/02-name-it.png)

### Pick Your Data
Before you can create a pulse, you’ll need to have some [saved questions](05-sharing-answers.md). You can choose up to five of them to put into a single pulse. Click the dropdown to see a list of all your saved questions. You can type in the dropdown to help filter and find the question you’re looking for.

![Pick your data](images/pulses/03-pick-your-data.png)

When you select a saved question, Metabase will show you a preview of how it’ll look in the pulse. Because of the space constraints of email and Slack, Metabase will automatically make some adjustments to the appearance of your saved question so that it looks great in the pulse. For example, in order to save space, pie charts will automatically be transformed into bar charts.

![Behold! The metamorphosis.](images/pulses/04-transformation.png)

Currently, there are a few restrictions on what kinds of saved questions you can put into a pulse:

* Raw data can’t be put in a pulse
* Tables will be cropped to a maximum of three columns and 10 rows
* Bar charts (and pie charts which get turned into bar charts) will be cropped to one column for the labels, one column for the values, and 10 total rows

### Choose How and When to Deliver Your Data
Each pulse you create can be delivered by email, Slack, or both. You can also set a different delivery schedule for email versus Slack. To deliver by email, just type in the email addresses you want to send the pulse to, separated by commas. Then, choose to either send it daily, weekly, or monthly, and the time you want it to be sent.

![Setting the email schedule](images/pulses/05-email-schedule.png)

To send via Slack, you’ll need to choose which channel you want to post the pulse in, whether you want it to post hourly or daily, and at what time. Again, the schedule for Slack can be different from the schedule for email.

Once you’re done, just click `Create pulse`. You’ll see your new pulse, along with its recipients, and the saved questions that are included in the pulse. If anyone else on your team wants to subscribe to a pulse that’s delivered by email, they can click the button that says `Get this email` from the Pulses screen.

![A beautiful, completed pulse](images/pulses/06-created.png)

### Editing and Deleting a Pulse
If you ever need to make changes to a pulse, just hover over the pulse from the list and click the `edit` button that appears.

![Edit button](images/pulses/07-edit-button.png)

If you want to delete a pulse, you can find that option at the bottom of the edit screen. Just remember: if you delete a pulse, no one will receive it anymore.

![The danger zone](images/pulses/08-delete.png)

---

## Next: Connecting Metabase to Slack with Metabot 🤖

If your team uses Slack to communicate, you can [use Metabot](11-metabot.md) to display your saved questions directly within Slack whenever you want.
