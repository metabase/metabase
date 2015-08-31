## ETL Guide
* Normalized vs denormalized data
* Database Views for fun and profit
	* ETL jobs vs database views
		* write load vs read load
		* performance implications
		* when to use views
	* how to create them
		* MySQL
		* PostgreSQL
	* Common examples
		* tables with an is_deleted flag
		* user table with a roles field
		* test accounts + data
* Dealing with events
	* pain on read vs pain on write
	* deciding what to collect
	* suggested event format
	* enriching events
	* preparing for cohort analysis
