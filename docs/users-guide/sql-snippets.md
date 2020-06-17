## SQL snippets

**SQL snippets** allow you to save, share, and reuse SQL statements. Anyone can create and edit snippets, and snippets become available for all to take advantage of. Metabase's Enterprise editions adds on additional functionality for managing snippets at scale by offering folder organization and group-level permissions.

### How to create a snippet

For example, if you frequently perform queries that involve multiple tables, you can save the statement that joins those tables as a **snippet**.

To illustrate **SQL snippets**, here's a simple query with a simple join using the **Sample Dataset** included with Metabase.

```sql
select *
from ORDERS
left join PRODUCTS on PRODUCT_ID = PRODUCT_ID;
```

In the **SQL editor**:
 
1. **Highlight a section of SQL** that you want to snip. In this case, we'll snip `from ORDERS left join PRODUCTS on PRODUCT_ID = PRODUCT_ID`.
2. **Right-click on the highlighted section**.
3. **Select Save as snippet** to create a snippet. A modal will pop up with the SQL statement you highlighted. 
4. **Edit, name, and describe your snippet**, then click the save button.

The snippet will now be available for anyone to use. Here's what it looks like:

```sql
select * 
{{snippet: Orders and Products}};
```

You can start typing `{{snippet:` and Metabase will present autocomplete options for available **snippets**.

### Snippet menu

Click on the code icon on the right side of the SQL editor, below Data Reference (book icon) and Variables (X icon). Metabase will slide out a sibebar menu that lists available snippets.

Click on a **snippet** to insert it into your query at the current cursor point.

Click on the down arrow to the right of a **snippet** to see a preview of the its SQL code.

![TODO image of preview]

You can also **edit** the **snippet**. You can change the SQL code, name, and description. You can also **archive** the **snippet**, which removes the **snippet** from the menu, but does not affect any existing queries that use the **snippet**.

