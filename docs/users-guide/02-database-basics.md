### A Short Overview of Databases
Before you jump into working with Metabase, it's helpful to know a few key database terms. 

A database is a **collection of tables**.

#### Tables
Tables contain one or more **columns** and one or more **rows**. 
A row is made up of cells and each cell has a value that corresponds to the column it falls under.  

Here's an example of a table:

| Name| Age |
| ---- | --- |
| John | 25 |
| Jenny | 31 |

Here the columns would be `Name` and `Age`. The first row would contain two cells, one with `John` and one with `25` (John's age).

#### Columns
All the cells in a column contain the same type of information.  For example, in the sample table above, the `Name` column contains names in each cell, while the `Age` column lists ages.  

Each field has a type that describes what kind of data is stored in the field.


Examples of types:

* **String Types** (TEXT, CHAR, VCHAR, etc.)  - These fields store things like names, addresses, or anything else that is text.

* **Numerical Types** (Integer, Float, DoubleFloat, Decimal, etc.) - These fields store numbers. Integers are whole numbers; floats and decimals are ways to store numbers with decimals in them. Numerical types store things like age, bank account balances, costs, latitudes, and longitudes. 

* **Time Types** (Timestamp, etc.) - These fields are a special format of a number used to store dates and times (or both). Sometimes databases store an integer timestamp which is either seconds or milliseconds, such as `00:00:00 Coordinated Universal Time (UTC), Thursday, 1 January 1970`. This convention  allows for compact storage of timestamps. 
* **IDs** (also called **primary keys**) - This field uniquely identifies each row.  For example, imagine a car reservation app where you can book a car in advance.  The ID of the reservation could be the reservation number (no two reservations would share the same reservation number).

**Customer**

| ID | Name| Age |  
| ---- | --- | --- |
| 11| John | 25 |
| 12| Jenny | 31 |

In the above table, the `ID` field is an ID (primary key). The `Name` field is a string type and the `Age` field is a numerical type (specifically an Integer).   


#### Relationships
Tables can contain references to other tables. 

For example, in our hypothetical car booking app, we would have two tables, one for reservations (let's call it **Reservation**) and one for customers, (we'll call this one **Customer**).  

To connect the reservation data to the corresponding customer data, you can use a `Foreign Key`.  A **`Foreign Key`** is a field used in databases when the contents of its field are the same value as the ID value of a connected row in another table. 
 
For example, in our hypothetical car booking app, we could connect each reservation to the customer that made the reservation by having the `Customer` column of the reservation contain the same value as the `ID` column of the customer who made the reservation.

**Reservation**

| Customer | Date | Car | 
| ---- | --- | --- | 
| 11 | 12/20/2015 | Toyota Camry |
| 12 | 1/2/2016 | Range Rover |


**Customer**

| ID | Name| Age |  
| ---- | --- | --- |
| 11| John | 25 |
| 12| Jenny | 31 |

If we wanted to analyze our hypothetical app's database with Metabase, we could ask a question, like: 

-- Example of a join --

Now that we have a shared vocabulary and a basic understanding of databases, let's learn more about [Asking Questions](03-asking-questions.md)