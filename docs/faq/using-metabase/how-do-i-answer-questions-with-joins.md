# How do I answer questions where I need to join tables together?

If you are using a Metabase version earlier than 0.33, you will need to either write a SQL query that contains joins, or have your Metabase administrator set up foreign keys (they can read more about that [here](../../administration-guide/03-metadata-editing.md)).

If you are using Metabase 0.33 or above, you can perform joins using the Notebook editor. Note that you will need to choose a field to join on, or link, the two tables together. For instance, if you want to combine a Customer table with an Order table, you might select the ID field in the Customer table and link it to the customer_id field in the order table.
