# I'm trying to ask a question, but it looks like I can't access some of the data I need

This can occur for several reasons:

- *The data source containing the data may not be connected to Metabase.* If you are an administrator, you can see a list of all of your connected data sources by clicking the gear icon, navigating to the Admin Panel, then clicking Databases in the top navigation.

- *You may not have permission to access the data in question.* Your administrator may need to [adjust your permissions][setting-permissions] by changing or modifying your user group.

- *The data may live in a different table other than the one you began the question with.*
 - If you are using Metabase version 0.32 or earlier, you will need to either write a SQL query that contains joins, or have your Metabase administrator [set up foreign keys][editing-metadata].
 - If you are using Metabase version 0.33 or above, you can perform joins using the Notebook Editor.
 
[editing-metadata]: ../../administration-guide/03-metadata-editing.html
[setting-permissions]: ../../administration-guide/05-setting-permissions.html
