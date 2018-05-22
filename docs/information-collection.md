# About the Information we collect:

Metabase uses Google Analytics to collect anonymous usage information from the installed servers that enable this feature. Below are the events we have instrumented, as well as the information we collect about the user performing the action and the instance being used.

While this list of anonymous information we collect might seem long, it’s useful to compare this to other alternatives. With a typical SaaS platform, not only will this information be collected, but it will also be accompanied by information about your data, how often it is accessed, the specific queries that you use, specific numbers of records all tied to your company and current plan.

We collect this information to improve your experience and the quality of Metabase, and in the list below, we spell out exactly why we collect each bit of information.

If you prefer not to provide us with this anonymous usage data, please go to your instance’s admin section and toggle off the option for `Anonymous Tracking`.


### Example questions we want to answer:
* Is our query interface working?
    * Are users stopping halfway through a question?
    * Are users using filters?
    * Are users using groupings?
    * How often are users using bare rows vs other aggregation options?
    * are people clicking on column headings to sort or manually adding a sort clause?
* How often are users writing SQL instead of using the query interface?
    * are these queries written by a select group of analysts or is the entire company sql literate?
* Are people using dashboards as a starting point for queries?
* how many clicks are there on dashboard cards?
* How many of these clicks result in modified queries that are executed?
* How often are questions saved?
* How often are saved questions added to dashboards?


### What we will do with the answers to these questions:
* Prioritize improvements in the query interface vs the SQL interface.
* Optimize the product for the usage patterns our users are using the product for
* Stay on top of browser incompatibilities
* Optimize our dashboards for either passive consumption or as a starting point for further exploration depending on how they are being used

While we will closely follow reported issues and feature requests, we aim to make as many of our users happy and provide them with improvements in features that matter to them. Allowing us to collect information about your instance gives your users a vote in future improvements in a direct way.


# The data we collect:

NOTE: we never capture any specific details in any of our tracking methodology such as user details, table names, field names, etc.  collected data is limited to the types of actions users are taking with the product.


### Events

| Category | Action | Why we collect this |
|---------|--------|--------------------|
| Links and Page Views | General website tracking of what pages are most used | This provides better understanding of what parts of the application are liked and used by customers so we know what's popular and potentially what needs more improvement. |
| Dashboards | When the dashboard dropdown is used, when dashboards are created and updated, what types of edits occur such as adding/removing cards and repositioning. | We use this information to understand how dashboards are being used and what types of activities users most commonly do on their dashboards. |
| Pulses | When pulses are created and updated, what types of pulses are created, and how many cards typically go in a pulse. | This is used to have a sense for how teams are structuring their push based communication.  When and where is information most often sent and how much information allows Metabase to continue improving features around push based data interactions. |
| Query Builder | When questions are saved and viewed along with what types of choices are made such as chart types and query clauses used. | Helps the Metabase team understand the basic patterns around how users are accessing their data. |
| SQL Query | When a SQL query is saved or run. | This mostly just gives us a sense for when users are bypassing the GUI query interface.  We never capture the actual SQL written. |
| Admin Settings | We capture some very basic stats about when settings are updated and if there are ever errors.  We also capture non-intrusive settings such as the chosen timezone. | We use this information to make sure that users aren't having problems managing their Metabase instance and it provides us some sense for the most common configuration choices so we can optimize for those cases. |
| Databases | We simply capture when databases are created or removed and what types of databases are being used | This helps Metabase ensure that we spend the most time and attention on the types of databases that are most popular to users. |
| Data Model | The saving and updates on tables, fields, segments, and metrics are all counted, along with a few other details such as what types of special metadata choices are made. | We use this data to help ensure that Metabase provides an appropriate set of options for users to describe their data and also gives us a sense for how much time users spend marking up their schemas. |
