
## Metadata Editing

*Note: For an in-depth description of Metabase's understanding of metadata and how it uses it, check out our [Metadata Guide](metadata-guide.md).*

### What is metadata?
Metadata is data about other data. It's data that tells you about the data found in your database. For example, we could label a field that looks like just a bunch of numbers with the label “latitude,” which now gives that information additional meaning.

### Editing your database’s metadata
First off, make sure you’re in the Admin Panel. Then click on **Metadata** for the top menu.

In the column on the left, you can choose which database you’re viewing, and then select the table whose metadata you want to view and edit.

You can edit metadata for two things: tables and fields.

### Metadata for tables 
* You can change the display name of a table by clicking and typing in the field where its name is displayed. This doesn’t change the *actual* name of the table in your database.
* Add descriptions to tables to let people know type of data a table contains and how it can be used. Descriptions are displayed in the data model reference panel in Metabase, which you can view by clicking the book icon in the top right of a new or saved question page.
* Tables can be set to Queryable or Hidden, controlling whether or not they’re accessible within Metabase.

### Metadata for fields
* Just like with tables, you can change the display name of your fields, and add descriptions to them so that other users will know what the field’s data represents. Descriptions are extra helpful when fields have values that are abbreviated or coded in a particular format.
* Metabase automatically attempts to classify your fields and assign them a type. If Metabase misclassified any fields, you can correct that here.
* The **Visibility** setting tells Metabase when and where you want a field to be displayed, or if you want it to be hidden.
* **Type** assigns a field a high-level category, and changes how the field can be used within Metabase. For example, only Metric fields can be added or averaged.
* **Details** let you give fields a more specific type, which enables special functionality. For example, if you set fields to Latitude and Longitude, you’ll be able to visualize the results from that table as a map. This is also where you can set a field to be a primary or foreign key of a table.

---
## Next: managing users
Let’s learn how to add, remove, and edit users in the [managing users section](04-managing-users.md).