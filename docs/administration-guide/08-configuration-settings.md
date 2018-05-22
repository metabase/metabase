
## Settings
Here are a few other miscellaneous settings you can configure from the home page of the **Admin Panel**.

### Site Name
How you’d like to refer to this instance of Metabase.

### Site URL
The base URL of this Metabase instance. The base URL is used in emails to allow users to click through to their specific instance. Make sure to include http:// or https:// to make sure it’s reachable.

### Report Timezone
The **report timezone** sets the default time zone for displaying times. The timezone is used when breaking out data by dates.

*Setting the default timezone will not change the timezone of any data in your database*. If the underlying times in your database aren't assigned to a timezone, Metabase will use the report timezone as the default timezone.

### Anonymous Tracking
This option turns determines whether or not you allow anonymous data about your usage of Metabase to be sent back to us to help us improve the product. *Your database’s data is never tracked or sent*.

### Friendly Table and Field Names
By default, Metabase attempts to make field and table names more readable by changing things like `somehorriblename` to `Some Horrible Name`. This does not work well for languages other than English, or for fields that have lots of abbreviations or codes in them. If you'd like to turn this setting off, you can do so from the Admin Panel under Settings > General > Friendly Table and Field Names.

To manually fix field or table names if they still look wrong, you can go to the Metadata section of the Admin Panel, select the database that contains the table or field you want to edit, select the table, and then edit the name(s) in the input boxes that appear.

---

## Next: Setting up Slack
If you want to use Slack to enhance the Metabase experience then lets do that now. Let’s learn [how to setup Slack](09-setting-up-slack.md).
