## A Short Overview of Databases

Before you jump into working with Metabase, it's helpful to know a few key database terms.

#### Tables

Fundamentally, databases are _collections of tables_. Tables contain one or more _columns_ and one or more _rows_. A row is made up of _cells_, and each cell has a _value_ that corresponds to the column it falls under.

Here's an example of a table:

| Name  | Age |
| ----- | --- |
| John  | 25  |
| Jenny | 31  |

Here, the columns are `Name` and `Age`. The first row contains two cells, one with `John` and one with `25`, corresponding to the Name and Age columns, respectively.

#### Columns

All the cells in a column contain the same type of information. For example, in the sample table above, the `Name` column contains names in each cell, while the `Age` column lists ages.

Columns are also sometimes interchangeably referred to as _fields_. Each field has a type that describes what kind of data is stored in the field.

**Examples of types:**

- **String Types** (TEXT, CHAR, VCHAR, etc.) - In the world of technology, snippets of text are referred to as “strings.” (You’ve probably heard of a “string of text” before.) These fields store things like names, addresses, or anything else that is text.

- **Numerical Types** (Integer, Float, DoubleFloat, Decimal, etc.) - These fields store numbers. Integers are whole numbers; Floats and Decimals are ways to store numbers with decimals in them. Numerical types store things like ages, bank account balances, costs, latitudes, and longitudes.

- **Time Types** (Timestamp, etc.) - These fields are a special number format used to store dates and times (or both), called “timestamps.” Sometimes databases store an integer timestamp which is either seconds or milliseconds, such as `00:00:00 Coordinated Universal Time (UTC), Thursday, 1 January 1970`. This convention allows for compact storage of timestamps.

- **IDs** (also called **primary keys**) - This field in a table uniquely identifies each row. For example, imagine a car reservation app where you can book a car in advance. The ID of the reservation could be the reservation number, and no two reservations would share the same reservation number, allowing each reservation to be uniquely identified by its reservation number.

**Example**

_Reservations Table_

| Reservation ID | Name  | Age |
| -------------- | ----- | --- |
| 11             | John  | 25  |
| 12             | Jenny | 31  |

In the above table, the `Reservation ID` field is the ID (primary key). The `Name` field is a string type and the `Age` field is a numerical type (specifically an Integer).

#### Relationships

Tables can contain references to other tables, which establishes a relationship between them.

For example, in our hypothetical car booking app’s database, we could have two tables: one for reservations (let's call it **Reservations**) and one for customers, (we'll call this one **Customers**).

To connect the reservation data to the corresponding customer data, you can use a _foreign key_. A foreign key is a special kind of field in a table that references the same column in a different table. Almost always, the field that the foreign key points to is the _ID_ or _primary key_ in the other table.

For example, in our hypothetical car booking app, we could connect each reservation in the Reservations table to the corresponding customer that made the reservation by having the `Customer` column of the reservation contain the same value as the `ID` column of the customer who made the reservation.

**Reservations**

| Customer | Date       | Car          |
| -------- | ---------- | ------------ |
| 11       | 12/20/2015 | Toyota Camry |
| 12       | 1/2/2016   | Range Rover  |

**Customers**

| ID  | Name  | Age |
| --- | ----- | --- |
| 11  | John  | 25  |
| 12  | Jenny | 31  |

If we wanted to analyze our hypothetical app's database with Metabase, we could ask a question, like:

    What's the average age of all customers who made reservations in February of 2015?

To do this, we’d open up the Reservation table, add a filter to only look at reservations between February 1 and February 28, 2015, and select `Average of…`. To select the average of Age specifically, we now put our foreign key to use and select Age from the _Customers_ table that our Reservations table references.

---

## Next: Asking questions

Now that we have a shared vocabulary and a basic understanding of databases, let's learn more about [exploring in Metabase](03-basic-exploration.md)
